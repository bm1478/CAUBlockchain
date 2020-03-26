"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const transaction_1 = require("./transaction");
// unconfirmed transaction 을 모아놓은 list. 비트코인에서는 Mempool 이라 함.
let transactionPool = [];
const getTransactionPool = () => {
    return _.cloneDeep(transactionPool);
};
exports.getTransactionPool = getTransactionPool;
const addToTransactionPool = (tx, unspentTxOuts) => {
    if (!transaction_1.validateTransaction(tx, unspentTxOuts)) {
        throw Error('Trying to add invalid tx to pool');
    }
    if (!isValidTxForPool(tx, transactionPool)) {
        throw Error('Trying to add invalid tx to pool');
    }
    console.log('adding to txPool: %s', JSON.stringify(tx));
    transactionPool.push(tx);
};
exports.addToTransactionPool = addToTransactionPool;
const hasTxIn = (txIn, unspentTxOuts) => {
    const foundTxIn = unspentTxOuts.find((uTxO) => {
        return uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex;
    });
    return foundTxIn !== undefined;
};
// TransactionPool 이 update  되는 과정.
const updateTransactionPool = (unspentTxOuts) => {
    const invalidTxs = [];
    // transactionPool 안에 있는 tx 중에서
    for (const tx of transactionPool) {
        // txIn 중에서 invvalid 한 것들을 찾아서 넣음.
        for (const txIn of tx.txIns) {
            if (!hasTxIn(txIn, unspentTxOuts)) {
                invalidTxs.push(tx);
                break;
            }
        }
    }
    // invalid 한 tx 들이 있다면, 제거
    if (invalidTxs.length > 0) {
        console.log('removing the following transactions from txPool: %s', JSON.stringify(invalidTxs));
        transactionPool = _.without(transactionPool, ...invalidTxs);
    }
};
exports.updateTransactionPool = updateTransactionPool;
const getTxPoolIns = (aTransactionPool) => {
    return _(aTransactionPool)
        .map((tx) => tx.txIns)
        .flatten()
        .value();
};
// 거래가 pool 에 담기기 전 유효성을 검사하는 과정.
const isValidTxForPool = (tx, aTransactionPool) => {
    const txPoolIns = getTxPoolIns(aTransactionPool);
    const containsTxIn = (txIns, txIn) => {
        return _.find(txPoolIns, (txPoolIns => {
            return txIn.txOutIndex === txPoolIns.txOutIndex && txIn.txOutId === txPoolIns.txOutId;
        }));
    };
    // TxIn 중에서 이미 transaction pool 에 있는지 확인. false 반환
    for (const txIn of tx.txIns) {
        if (containsTxIn(txPoolIns, txIn)) {
            console.log('txIn already found in the txPool');
            return false;
        }
    }
    return true;
};
//# sourceMappingURL=transactionpool.js.map