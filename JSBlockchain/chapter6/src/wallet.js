"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const elliptic_1 = require("elliptic");
const fs_1 = require("fs");
const _ = require("lodash");
const transaction_1 = require("./transaction");
const EC = new elliptic_1.ec('secp256k1');
// 개인키의 위치를 설정.
const privateKeyLocation = process.env.PRIVATE_KEY || 'node/wallet/private_key';
// 지갑에서 개인 및 공개키를 추출하는 과정. unencrypt 된 개인키를 저장하는 것은 안전하지 않음.
const getPrivateFromWallet = () => {
    const buffer = fs_1.readFileSync(privateKeyLocation, 'utf8');
    return buffer.toString();
};
exports.getPrivateFromWallet = getPrivateFromWallet;
// 공개키가 형성되는 과정.
const getPublicFromWallet = () => {
    const privateKey = getPrivateFromWallet();
    // 개인키를 형성하고
    const key = EC.keyFromPrivate(privateKey, 'hex');
    // 이를 기준으로 공개키 만들어냄.
    return key.getPublic().encode('hex');
};
exports.getPublicFromWallet = getPublicFromWallet;
// 개인키가 생성되는 과정.
const generatePrivateKey = () => {
    const keyPair = EC.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};
exports.generatePrivateKey = generatePrivateKey;
// 개인키가 지갑에 저장되는 과정.
const initWallet = () => {
    // 이미 개인키가 존재한다면 덮어쓰지 않음.
    if (fs_1.existsSync(privateKeyLocation)) {
        return;
    }
    const newPrivateKey = generatePrivateKey();
    fs_1.writeFileSync(privateKeyLocation, newPrivateKey);
    console.log('new wallet with private key created');
};
exports.initWallet = initWallet;
const deleteWallet = () => {
    if (fs_1.existsSync(privateKeyLocation)) {
        fs_1.unlinkSync(privateKeyLocation);
    }
};
exports.deleteWallet = deleteWallet;
// 지갑의 잔고 계산하는 과정.
const getBalance = (address, unspentTxOuts) => {
    return _(unspentTxOuts)
        // utxo 의 주소와 일치하는지 확인.
        .filter((uTxO) => uTxO.address === address)
        // 일치하는 해당 utxo 의 양을 확인.
        .map((uTxO) => uTxO.amount)
        // 양들을 합쳐서 결과를 냄.
        .sum();
};
exports.getBalance = getBalance;
const findUnspentTxOuts = (ownerAddress, unspentTxOuts) => {
    return _.filter(unspentTxOuts, (uTxO) => uTxO.address === ownerAddress);
};
exports.findUnspentTxOuts = findUnspentTxOuts;
// 사용되지 않은 출력값을 검색하는 과정.
const findTxOutsForAmount = (amount, myUnspentTxOuts) => {
    let currentAmount = 0;
    const includedUnspentTxOuts = [];
    for (const myUnspentTxOut of myUnspentTxOuts) {
        // 윗줄에서 설정한 includedUnspentTxOuts 에 myUnspentTxOut 넣음.
        includedUnspentTxOuts.push(myUnspentTxOut);
        // currentAmount 는 시작할 때 0으로 시작. 그 후에 지속적으로 utxo 의 값을 더함.
        currentAmount = currentAmount + myUnspentTxOut.amount;
        // 실제 값 이상이 될 때까지 지속적으로 값을 더함.
        if (currentAmount >= amount) {
            // 남은 값을 계산.돌아오는 값.
            const leftOverAmount = currentAmount - amount;
            return { includedUnspentTxOuts, leftOverAmount };
        }
    }
    const eMsg = 'Cannot create transaction from the available unspent transaction outputs.' +
        ' Required amount:' + amount + '. Available unspentTxOuts:' + JSON.stringify(myUnspentTxOuts);
    throw Error(eMsg);
};
// TxOuts 생성하는 과정.
const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
    const txOut1 = new transaction_1.TxOut(receiverAddress, amount);
    // leftOverAmount 가 0이라면, 즉, 딱 필요한 만큼만 검색됐다면 txOut1은 내보냄.
    if (leftOverAmount === 0) {
        return [txOut1];
    }
    else {
        // 그게 아니라면 다시 내 주소로 돌아오는 새로운 거래 만들어서 출력값 내보냄.
        const leftOverTx = new transaction_1.TxOut(myAddress, leftOverAmount);
        return [txOut1, leftOverTx];
    }
};
const filterTxPoolTxs = (unspentTxOuts, transactionPool) => {
    const txIns = _(transactionPool)
        .map((tx) => tx.txIns)
        .flatten()
        .value();
    const removable = [];
    for (const unspentTxOut of unspentTxOuts) {
        const txIn = _.find(txIns, (aTxIn) => {
            return aTxIn.txOutIndex === unspentTxOut.txOutIndex && aTxIn.txOutId === unspentTxOut.txOutId;
        });
        if (txIn === undefined) {
        }
        else {
            removable.push(unspentTxOut);
        }
    }
    return _.without(unspentTxOuts, ...removable);
};
const createTransaction = (receiverAddress, amount, privateKey, unspentTxOuts, txPool) => {
    console.log('txPool: %s', JSON.stringify(txPool));
    const myAddress = transaction_1.getPublicKey(privateKey);
    const myUnspentTxOutsA = unspentTxOuts.filter((uTxO) => uTxO.address === myAddress);
    const myUnspentTxOuts = filterTxPoolTxs(myUnspentTxOutsA, txPool);
    const { includedUnspentTxOuts, leftOverAmount } = findTxOutsForAmount(amount, myUnspentTxOuts);
    // UTXO 리스트로 txIn 만들어내는 과정.
    const toUnsignedTxIn = (unspentTxOut) => {
        const txIn = new transaction_1.TxIn();
        txIn.txOutId = unspentTxOut.txOutId;
        txIn.txOutIndex = unspentTxOut.txOutIndex;
        return txIn;
    };
    // txIns 를 서명하는 과정
    const unsignedTxIns = includedUnspentTxOuts.map(toUnsignedTxIn);
    const tx = new transaction_1.Transaction();
    tx.txIns = unsignedTxIns;
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
    tx.id = transaction_1.getTransactionId(tx);
    tx.txIns = tx.txIns.map((txIn, index) => {
        txIn.signature = transaction_1.signTxIn(tx, index, privateKey, includedUnspentTxOuts);
        return txIn;
    });
    return tx;
};
exports.createTransaction = createTransaction;
//# sourceMappingURL=wallet.js.map