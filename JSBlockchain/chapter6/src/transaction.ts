import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';

const ec = new ecdsa.ec('secp256k1');

// 채굴을 통해 주어지는 코인
const COINBASE_AMOUNT: number = 50;

// 사용되지 않은 출력값, 소유한 개인키와 쌍을 이루는 공개키와 연관된 소비되지 않은 거래의 output 에 대한 소유권이 있는 것.
// 코인 그 자체를 소유한 것이 아님.
// 올바른 거래 검증 시, 사용되지 않은 거래의 출력값의 리스트만 살펴보면 됨.

class UnspentTxOut {
    public readonly txOutId: string;
    public readonly txOutIndex: number;
    public readonly address: string;
    public readonly amount: number;

    constructor(txOutId: string, txOutIndex: number, address: string, amount: number) {
        this.txOutId = txOutId;
        this.txOutIndex = txOutIndex;
        this.address = address;
        this.amount = amount;
    }
}

// 거래의 input 을 설명. 코인이 어디에서 왔는지를 알려줌. 이전 output 값을 참조, 코인들이 서명(주소가 참조한 개인키 소유 유저만이 가능)과 함께 unlock
class TxIn {
    // txOutId, txOutIndex 그리고 서명으로 이루어짐.
    public txOutId: string;
    public txOutIndex: number;
    public signature: string;
}

// 거래의 output 을 설명. 이 주소는 공개키. 참조된 공개키와 한 쌍의 개인키를 가진 유저가 코인에 접근할 수 있다는 것을 의미.
class TxOut {
    // address 와 amount 로 이루어짐
    public address: string;
    public amount: number;

    constructor(address: string, amount: number) {
        this.address = address;
        this.amount = amount;
    }
}

class Transaction {
    public id: string;
    public txIns: TxIn[];
    public txOuts: TxOut[];
}

// 거래 Id를 구하는 과정.
const getTransactionId = (transaction: Transaction): string => {
    const txInContent: string = transaction.txIns
        // TxIn 을 요소로 받고, txIn.txOutId + txIn.txOutIndex 을 결과물로 냄.
        .map((txIn: TxIn) => txIn.txOutId + txIn. txOutIndex)
        // a 가 있는 상태에서 b를 지속적으로 축적.
        .reduce((a,b) => a + b, '');

    const txOutContent: string = transaction.txOuts
        // TxOut을 요소로 받고, txOut.address + txOut.amount를 결과물로 낸다.
        .map((txOut: TxOut) => txOut.address + txOut.amount)
        // a 가 있는 상태에서 b 를 지속적으로 축적.
        .reduce((a, b) => a + b, '');

    return CryptoJS.SHA256(txInContent + txOutContent).toString();
};

// 거래의 유효성 검증.
const validateTransaction = (transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {
    // txId 의 유효성 검증.
    if(!isValidTransactionStructure(transaction)) {
        return false;
    }

    if(getTransactionId(transaction) !== transaction.id) {
        console.log('invalid tx id: ' + transaction.id);
        return false;
    }
    // txIns 의 유효성 검증.
    const hasValidTxIns: boolean = transaction.txIns
        .map((txIn) => validateTxIn(txIn, transaction, aUnspentTxOuts))
        .reduce((a, b) => a && b, true);
    // true 값이 반환되지 않았다면, 유효하지 않은 txIn 이라는 것을 공지.
    if(!hasValidTxIns) {
        console.log('some of the txIns are invalid in tx: ' + transaction.id);
        return false;
    }
    // 거레 입력값의 크기 추출
    const totalTxInValues: number=  transaction.txIns
        .map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
        .reduce((a, b) => (a + b), 0);
    // 거래 출력값의 크기 추출
    const totalTxOutValues: number = transaction.txOuts
        .map((txOut) => txOut.amount)
        .reduce((a, b) => (a + b), 0);

    // 거래의 입력값과 출력값의 크기가 같은지 확인.
    if(totalTxOutValues !== totalTxInValues) {
        console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction.id);
        return false;
    }
    return true;
};

const validateBlockTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number): boolean => {
    const coinbaseTx = aTransactions[0];
    if(!validateCoinbaseTx(coinbaseTx, blockIndex)) {
        console.log('invalid coinbase transaction: ' + JSON.stringify(coinbaseTx));
        return false;
    }

    // check for duplicate txIns. Each txIn can be included only once
    const txIns: TxIn[] = _(aTransactions)
        .map(tx => tx.txIns)
        .flatten()
        .value();

    if(hasDuplicates(txIns)) {
        return false;
    }

    // all but coinbase transactions
    const normalTransactions: Transaction[] = aTransactions.slice(1);
    return normalTransactions.map((tx) => validateTransaction(tx, aUnspentTxOuts))
        .reduce((a, b) => (a && b), true);
};

const hasDuplicates = (txIns: TxIn[]): boolean => {
    const groups = _.countBy(txIns, (txIn) => txIn.txOutId + txIn.txOutId);
    return _(groups)
        .map((value, key) => {
            if(value>1) {
                console.log('duplicate txIn: ' + key);
                return true;
            }
            else {
                return false;
            }
        })
        .includes(true);
};

// 코인베이스 거래의 유효성 검증.
const validateCoinbaseTx = (transaction: Transaction, blockIndex: number): boolean => {
    // txId의 유효성 검증
    if(getTransactionId(transaction) !== transaction.id) {
        console.log('invalid coinbase tx id: ' + transaction.id);
        return false;
    }
    // txIn 의 길이가 1인지 확인.
    if(transaction.txIns.length !== 1) {
        console.log('one txIn must be specified in the coinbase transaction');
        return false;
    }
    // txIn 의 index 와 블록 높이가 일치하는지 확인.
    if(transaction.txIns[0].txOutIndex !== blockIndex) {
        console.log('the txIn index in coinbase tx must be the block height');
        return false;
    }
    // txOut 의 길이가 1인지 확인.
    if(transaction.txOuts.length !== 1) {
        console.log('invalid number of txOuts in coinbase transaction');
        return false;
    }
    // 코인베이스 거래의 크기를 비교하는 과정.
    if(transaction.txOuts[0].amount != COINBASE_AMOUNT) {
        console.log('invalid coinbase amount in coinbase transaction');
        return false;
    }
    return true;
};

// txIn의 유효성 검증.
const validateTxIn = (txIn: TxIn, transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {
    const referencedUTxOut: UnspentTxOut =
        // txIn의 서명들의 유효성 검증.
        aUnspentTxOuts.find((uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutId === txIn.txOutId);
    // 참조한 txOut 들이 사용되지 않아야 함.
    if(referencedUTxOut == null) {
        console.log('referenced txOut not found: ' + JSON.stringify(txIn));
        return false;
    }
    const address = referencedUTxOut.address;

    const key = ec.keyFromPublic(address, 'hex');
    return key.verify(transaction.id, txIn.signature);
};

const getTxInAmount = (txIn: TxIn, aUnsepntTxOuts: UnspentTxOut[]): number => {
    return findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnsepntTxOuts).amount;
};

const findUnspentTxOut = (transactionId: string, index: number, aUnspentTxOuts: UnspentTxOut[]): UnspentTxOut => {
    return aUnspentTxOuts.find((uTxO) => uTxO.txOutId === transactionId && uTxO.txOutIndex === index);
};

const getCoinbaseTransaction = (address:string, blockIndex: number): Transaction => {
    const t = new Transaction();
    const txIn: TxIn = new TxIn();
    txIn.signature = "";
    txIn.txOutId = "";
    txIn.txOutIndex = blockIndex;

    t.txIns = [txIn];
    t.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
    t.id = getTransactionId(t);
    return t;
};

// 거래 서명.
const signTxIn = (transaction: Transaction, txIndex: number,
                  privateKey: string, aUnspentTxOuts: UnspentTxOut[]): string => {
    const txIn: TxIn = transaction.txIns[txIndex];

    const dataToSign = transaction.id;
    const referencedUnspentTxOut: UnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts);
    // 해당 출력값이 사용되지 않은 출력값 list 에 없으면 오류를 반환.
    if(referencedUnspentTxOut == null) {
        console.log('could not find referenced txOut');
        throw Error();
    }

    const referencedAddress = referencedUnspentTxOut.address;
    // referencedAddress 와 privateKey 로부터 생성된 public key가 일치하는지 확인하고 그렇지 않다면 오류 반환.
    if(getPublicKey(privateKey) !== referencedAddress) {
        console.log('trying to sign an input with private' +
        ' key that does not match the address that is referenced in txIn');
        throw Error();
    }

    const key = ec.keyFromPrivate(privateKey, 'hex');
    return toHexString(key.sign(dataToSign).toDER());
};

// UTXO 를 업데이트하는 과정.
const updateUnspentTxOuts = (newTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[]): UnspentTxOut[] => {
    // 새로운 UTXO 를 파악.
    const newUnspentTxOuts: UnspentTxOut[] = newTransactions
        .map((t) => {
            return t.txOuts.map((txOut, index) => new UnspentTxOut(t.id, index, txOut.address, txOut.amount));
        })
        .reduce((a, b) => a.concat(b), []);

    // 사용한 UTXO 를 파악. 새로운 거래들의 input 값을 통해서 사용된 output 값을 파악.
    const consumedTxOuts: UnspentTxOut[] = newTransactions
        .map((t) => t.txIns)
        .reduce((a, b) => a.concat(b), [])
        .map((txIn) => new UnspentTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

    return aUnspentTxOuts
        .filter(((uTxO) => !findUnspentTxOut(uTxO.txOutId, uTxO.txOutIndex, consumedTxOuts)))
        .concat(newUnspentTxOuts);
};

const processTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number) => {
    if(!validateBlockTransactions(aTransactions, aUnspentTxOuts, blockIndex)) {
        console.log('invalid block transactions');
        return null;
    }
    return updateUnspentTxOuts(aTransactions, aUnspentTxOuts);
};

const toHexString = (byteArray): string => {
    return Array.from(byteArray, (byte: any) => {
        return('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
};

const getPublicKey = (aPrivateKey: string): string => {
    return ec.keyFromPrivate(aPrivateKey, 'hex').getPublic().encode('hex');
};

const isValidTxInStructure = (txIn: TxIn) : boolean => {
    if(txIn==null) {
        console.log('txIn is null');
        return false;
    }
    else if(typeof txIn.signature !== 'string') {
        console.log('invalid signature type in txIn');
        return false;
    }
    else if(typeof txIn.txOutId !== 'string') {
        console.log('invalid txOutId type in txIn');
        return false;
    }
    else if(typeof txIn.txOutIndex !== 'number') {
        console.log('invalid txOutIndex type in txIn');
        return false;
    }
    else {
        return true;
    }
};

const isValidTxOutStructure = (txOut: TxOut): boolean => {
    if (txOut == null) {
        console.log('txOut is null');
        return false;
    } else if (typeof txOut.address !== 'string') {
        console.log('invalid address type in txOut');
        return false;
    } else if (!isValidAddress(txOut.address)) {
        console.log('invalid TxOut address');
        return false;
    } else if (typeof txOut.amount !== 'number') {
        console.log('invalid amount type in txOut');
        return false;
    } else {
        return true;
    }
};

// 거래 구조가 올바른 형태인지 확인.
const isValidTransactionStructure = (transaction: Transaction) => {
    // txId 가 string 형태인지
    if(typeof transaction.id !== 'string') {
        console.log('transactionId missing');
        return false;
    }
    // txIns 가 array 형태인지
    if(!(transaction.txIns instanceof Array)) {
        console.log('invalid txIns type in transaction');
        return false;
    }
    // isValidTxInStructure 의 결과가 true 인지
    if(!transaction.txIns
        .map(isValidTxInStructure)
        .reduce((a, b) => (a && b), true)) {
        return false;
    }
    // txOuts 가 array 형태인지
    if(!(transaction.txOuts instanceof Array)) {
        console.log('invalid txIns type in transaction');
        return false;
    }
    // isValidTxOutStructure 의 결과가 true 인지
    return transaction.txOuts
        .map(isValidTxOutStructure)
        .reduce((a, b) => (a && b), true);

};

const isValidAddress = (address: string): boolean => {
    if(address.length !== 130) {
        console.log('invalid public key length');
        return false;
    }
    else if(address.match('^[a-fA-F0-9]+$') === null) {
        console.log('public key must contain only hex characters');
        return false;
    }
    else if(!address.startsWith('04')) {
        console.log('public key must start with 04');
        return false;
    }
    return true;
};

export {
    processTransactions, signTxIn, getTransactionId, isValidAddress,
    UnspentTxOut, TxIn, TxOut, getCoinbaseTransaction, getPublicKey,
    Transaction, validateTransaction, hasDuplicates
}
