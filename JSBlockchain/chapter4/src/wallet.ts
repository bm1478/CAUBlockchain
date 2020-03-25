import {ec} from 'elliptic';
import {existsSync, readFileSync, writeFileSync} from "fs";
import * as _ from 'lodash';
import {getPublicKey, getTransactionId, signTxIn, Transaction, TxIn, TxOut, UnspentTxOut} from "./transaction";

const EC = new ec('secp256k1');
// 개인키의 위치를 설정.
const privateKeyLocation = process.env.PRIVATE_KEY || 'node/wallet/private_key';

// 지갑에서 개인 및 공개키를 추출하는 과정. unencrypt 된 개인키를 저장하는 것은 안전하지 않음.
const getPrivateFromWallet = (): string => {
    const buffer = readFileSync(privateKeyLocation, 'utf8');
    return buffer.toString();
};

// 공개키가 형성되는 과정.
const getPublicFromWallet = (): string => {
    const privateKey = getPrivateFromWallet();
    // 개인키를 형성하고
    const key = EC.keyFromPrivate(privateKey, 'hex');
    // 이를 기준으로 공개키 만들어냄.
    return key.getPublic().encode('hex');
};

// 개인키가 생성되는 과정.
const generatePrivateKey = (): string => {
    const keyPair = EC.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};

// 개인키가 지갑에 저장되는 과정.
const initWallet = () => {
    // 이미 개인키가 존재한다면 덮어쓰지 않음.
    if(existsSync(privateKeyLocation)) {
        return;
    }
    const newPrivateKey = generatePrivateKey();

    writeFileSync(privateKeyLocation, newPrivateKey);
    console.log('new wallet with private key created');
};

// 지갑의 잔고 계산하는 과정.
const getBalance = (address: string, unspentTxOuts: UnspentTxOut[]): number => {
    return _(unspentTxOuts)
    // utxo 의 주소와 일치하는지 확인.
        .filter((uTxO: UnspentTxOut) => uTxO.address === address)
    // 일치하는 해당 utxo 의 양을 확인.
        .map((uTxO: UnspentTxOut) => uTxO.amount)
    // 양들을 합쳐서 결과를 냄.
        .sum();
};

// 사용되지 않은 출력값을 검색하는 과정.
const findTxOutsForAmount = (amount: number, myUnspentTxOuts: UnspentTxOut[]) => {
    let currentAmount = 0;
    const includedUnspentTxOuts = [];
    for (const myUnspentTxOut of myUnspentTxOuts) {
        // 윗줄에서 설정한 includedUnspentTxOuts 에 myUnspentTxOut 넣음.
        includedUnspentTxOuts.push(myUnspentTxOut);
        // currentAmount 는 시작할 때 0으로 시작. 그 후에 지속적으로 utxo 의 값을 더함.
        currentAmount = currentAmount + myUnspentTxOut.amount;
        // 실제 값 이상이 될 때까지 지속적으로 값을 더함.
        if(currentAmount >= amount) {
            // 남은 값을 계산.돌아오는 값.
            const leftOverAmount = currentAmount -amount;
            return {includedUnspentTxOuts, leftOverAmount}
        }
    }
    // 만약 충분하지 않은 양 보유하면 잔고 부족이라는 메시지와 오류.
    throw Error('not enough coins to send transaction');
};

// TxOuts 생성하는 과정.
const createTxOuts = (receiverAddress: string, myAddress: string, amount, leftOverAmount: number) => {
    const txOut1: TxOut = new TxOut(receiverAddress, amount);
    // leftOverAmount 가 0이라면, 즉, 딱 필요한 만큼만 검색됐다면 txOut1은 내보냄.
    if(leftOverAmount === 0) {
        return [txOut1];
    }
    else {
        // 그게 아니라면 다시 내 주소로 돌아오는 새로운 거래 만들어서 출력값 내보냄.
        const leftOverTx = new TxOut(myAddress, leftOverAmount);
        return [txOut1, leftOverTx];
    }
};

const createTransaction = (receiverAddress: string, amount: number,
                         privateKey: string, unspentTxOuts: UnspentTxOut[]): Transaction => {
    const myAddress: string = getPublicKey(privateKey);
    const myUnspentTxOuts = unspentTxOuts.filter((uTxO: UnspentTxOut) => uTxO.address === myAddress);

    const {includedUnspentTxOuts, leftOverAmount} = findTxOutsForAmount(amount, myUnspentTxOuts);
    // UTXO 리스트로 txIn 만들어내는 과정.
    const toUnsignedTxIn = (unspentTxOut: UnspentTxOut) => {
        const txIn: TxIn = new TxIn();
        txIn.txOutId = unspentTxOut.txOutId;
        txIn.txOutIndex = unspentTxOut.txOutIndex;
        return txIn;
    };

    // txIns 를 서명하는 과정
    const unsignedTxIns: TxIn[] = includedUnspentTxOuts.map(toUnsignedTxIn);

    const tx: Transaction = new Transaction();
    tx.txIns = unsignedTxIns;
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
    tx.id = getTransactionId(tx);

    tx.txIns = tx.txIns.map((txIn: TxIn, index: number) => {
        txIn.signature = signTxIn(tx, index, privateKey, includedUnspentTxOuts);
        return txIn;
    });

    return tx;
};

export {createTransaction, getPublicFromWallet, getPrivateFromWallet, getBalance, generatePrivateKey, initWallet};
