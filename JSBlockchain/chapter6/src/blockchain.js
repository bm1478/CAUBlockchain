"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CryptoJS = require("crypto-js");
const _ = require("lodash");
const p2p_1 = require("./p2p");
const transaction_1 = require("./transaction");
const transactionpool_1 = require("./transactionpool");
const util_1 = require("./util");
const wallet_1 = require("./wallet");
// Block의 Class를 설정한다.
class Block {
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}
exports.Block = Block;
const genesisTransaction = {
    'txIns': [{ 'signature': '', 'txOutId': '', 'txOutIndex': 0 }],
    'txOuts': [{
            'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
            'amount': 50
        }],
    'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
};
// genesisBlock 하드 코딩.
const genesisBlock = new Block(0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', null, 1465154705, [genesisTransaction], 0, 0);
// 블록체인의 정보를 받아오는 과정.
// 제네시스 블록을 가장 먼저 받아온다. 블록체인 저장을 시작하는 과정.
let blockchain = [genesisBlock];
// the unspent txOut of genesis block is set to unspentTxOuts on startup
let unspentTxOuts = transaction_1.processTransactions(blockchain[0].data, [], 0);
const getBlockchain = () => blockchain;
exports.getBlockchain = getBlockchain;
// 마지막 블록의 정보를 가지고 오는 과정. 현 체인의 길이에서 - 1 을 한 index를 가지고 있는 블록의 정보를 가져옴.
const getUnspentTxOuts = () => _.cloneDeep(unspentTxOuts);
exports.getUnspentTxOuts = getUnspentTxOuts;
// and txPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut) => {
    console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
    unspentTxOuts = newUnspentTxOut;
};
const getLatestBlock = () => blockchain[blockchain.length - 1];
exports.getLatestBlock = getLatestBlock;
// 블록 생성 주기와 난이도 조정 주기
// 블록 생성 주기
const BLOCK_GENERATION_INTERVAL = 10;
// 난이도 조정 주기
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;
const getDifficulty = (aBlockchain) => {
    const latestBlock = aBlockchain[blockchain.length - 1];
    if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(latestBlock, aBlockchain);
    }
    else {
        return latestBlock.difficulty;
    }
};
const getAdjustedDifficulty = (latestBlock, aBlockchain) => {
    const prevAdjustmentBlock = aBlockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
    if (timeTaken < timeExpected / 2) {
        return prevAdjustmentBlock.difficulty + 1;
    }
    else if (timeTaken > timeExpected * 2) {
        return prevAdjustmentBlock.difficulty - 1;
    }
    else {
        return prevAdjustmentBlock.difficulty;
    }
};
const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);
const generateRawNextBlock = (blockData) => {
    const previousBlock = getLatestBlock();
    const difficulty = getDifficulty(getBlockchain());
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = getCurrentTimestamp();
    const newBlock = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    if (addBlockToChain(newBlock)) {
        p2p_1.broadcastLatest();
        return newBlock;
    }
    else {
        return null;
    }
};
exports.generateRawNextBlock = generateRawNextBlock;
const getMyUnspentTransactionOutputs = () => {
    return wallet_1.findUnspentTxOuts(wallet_1.getPublicFromWallet(), getUnspentTxOuts());
};
exports.getMyUnspentTransactionOutputs = getMyUnspentTransactionOutputs;
// 새로운 블록이 생성되고 거래가 이에 담기는 과정.
const generateNextBlock = () => {
    // 코인베이스 거래. 지갑의 주소와 블록 번호가 담김. 블록 번호는 가장 마지막 번호보다 1이 더 큰 형태
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), getLatestBlock().index + 1);
    // blockdata 로 coinbase 거래와 나머지 pool에 있는 거래들 넣음.
    const blockData = [coinbaseTx].concat(transactionpool_1.getTransactionPool());
    return generateRawNextBlock(blockData);
};
exports.generateNextBlock = generateNextBlock;
const generatenextBlockWithTransaction = (receiverAddress, amount) => {
    if (!transaction_1.isValidAddress(receiverAddress)) {
        throw Error('invalid address');
    }
    if (typeof amount !== 'number') {
        throw Error('invalid amount');
    }
    const coinbaseTx = transaction_1.getCoinbaseTransaction(wallet_1.getPublicFromWallet(), getLatestBlock().index + 1);
    const tx = wallet_1.createTransaction(receiverAddress, amount, wallet_1.getPrivateFromWallet(), getUnspentTxOuts(), transactionpool_1.getTransactionPool());
    const blockData = [coinbaseTx, tx];
    return generateRawNextBlock(blockData);
};
exports.generatenextBlockWithTransaction = generatenextBlockWithTransaction;
// 유요한 블록 생성.
const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    // nonce를 0으로 먼저 설정.
    let nonce = 0;
    while (true) {
        const hash = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        // hashMathcedDifficulty 사용. 조건문이 true일때까지 반복
        if (hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
        }
        nonce++;
    }
};
const getAccountBalance = () => {
    return wallet_1.getBalance(wallet_1.getPublicFromWallet(), unspentTxOuts);
};
exports.getAccountBalance = getAccountBalance;
const sendTransaction = (address, amount) => {
    const tx = wallet_1.createTransaction(address, amount, wallet_1.getPrivateFromWallet(), getUnspentTxOuts(), transactionpool_1.getTransactionPool());
    transactionpool_1.addToTransactionPool(tx, getUnspentTxOuts());
    p2p_1.broadCastTransactionPool();
    return tx;
};
exports.sendTransaction = sendTransaction;
const calculateHashForBlock = (block) => calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);
// block의 구성요소들로 hash 값 생성하는 과정.
const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();
// 블록 구조의 유효성 판단.
const isValidBlockStructure = (block) => {
    // 정의된 요소들의 각 항과 일치한지 검사.
    return typeof block.index === 'number'
        && typeof block.hash === 'string'
        && typeof block.previousHash === 'string'
        && typeof block.timestamp === 'number'
        && typeof block.data === 'object';
};
exports.isValidBlockStructure = isValidBlockStructure;
const isValidNewBlock = (newBlock, previousBlock) => {
    if (!isValidBlockStructure(newBlock)) {
        console.log('invalid structure');
        console.log(newBlock);
        return false;
    }
    // 블록의 index에 이전 블록의 index보다 1이 커야 한다. 그렇지 않으면, false를 반환.
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }
    // 블록의 previousHash와 이전 블록의 hash가 일치해야 한다. 그렇지 않으면, false를 반환.
    else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    }
    // 블록의 hash 값 자체가 유효해야한다. 그렇지 않으면, false.
    else if (!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    }
    else if (!hasValidHash(newBlock)) {
        return false;
    }
    return true;
};
const getAccumulatedDifficulty = (aBlockchain) => {
    return aBlockchain
        .map((block) => block.difficulty)
        .map((difficulty) => Math.pow(2, difficulty))
        .reduce((a, b) => a + b);
};
const isValidTimestamp = (newBlock, previousBlock) => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp)
        && newBlock.timestamp - 60 < getCurrentTimestamp();
};
const hasValidHash = (block) => {
    if (!hashMatchesBlockContent(block)) {
        console.log('invalid hash, got: ' + block.hash);
        return false;
    }
    if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
    }
    return true;
};
const hashMatchesBlockContent = (block) => {
    const blockHash = calculateHashForBlock(block);
    return blockHash === block.hash;
};
// hash 값이 올바른지 검증.
const hashMatchesDifficulty = (hash, difficulty) => {
    // 16진수 hash값을 2진으로 교체.
    const hashInBinary = util_1.hexToBinary(hash);
    // 난이도만큼의 개수의 0이 앞에 나오는가 확인.
    const requiredPrefix = '0'.repeat(difficulty);
    // 2진으로 바뀐 hash값의 맨 앞에 난이도만큼의 개수의 0이 나오는지 확인.
    return hashInBinary.startsWith(requiredPrefix);
};
// 체인의 유효성 검사
const isValidChain = (blockchainToValidate) => {
    // 체인의 첫번째 블록이 genesisBlock과 일치하는지 확인.
    console.log('isValidChain: ');
    console.log(JSON.stringify(blockchainToValidate));
    const isValidGenesis = (block) => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };
    if (!isValidGenesis(blockchainToValidate[0])) {
        return null;
    }
    /*
    Validate each block in the chain. The block is valid if the block structure is valid and the transaction are valid
     */
    let aUnspentTxOuts = [];
    // isValidNewBlock을 통해 전체 체인 검증.
    for (let i = 1; i < blockchainToValidate.length; i++) {
        const currentBlock = blockchainToValidate[i];
        if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
            return null;
        }
        aUnspentTxOuts = transaction_1.processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
        if (aUnspentTxOuts === null) {
            console.log('invalid transactions in blockchain');
            return null;
        }
    }
    return aUnspentTxOuts;
};
const addBlockToChain = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        const retVal = transaction_1.processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
        if (retVal === null) {
            return false;
        }
        else {
            blockchain.push(newBlock);
            setUnspentTxOuts(retVal);
            transactionpool_1.updateTransactionPool(unspentTxOuts);
            return true;
        }
    }
    return false;
};
exports.addBlockToChain = addBlockToChain;
const replaceChain = (newBlocks) => {
    // getBlockchain과 isValidChain을 사용
    // 새로운 chain이 유효한 chain이고 그 chain이 기존의 것보다 더 길면 교체.
    const aUnspentTxOuts = isValidChain(newBlocks);
    const validChain = aUnspentTxOuts !== null;
    if (validChain &&
        getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        setUnspentTxOuts(aUnspentTxOuts);
        transactionpool_1.updateTransactionPool(unspentTxOuts);
        p2p_1.broadcastLatest();
    }
    else {
        console.log('Received blockchain invalid');
    }
};
exports.replaceChain = replaceChain;
const handleReceivedTransaction = (transaction) => {
    transactionpool_1.addToTransactionPool(transaction, getUnspentTxOuts());
};
exports.handleReceivedTransaction = handleReceivedTransaction;
//# sourceMappingURL=blockchain.js.map