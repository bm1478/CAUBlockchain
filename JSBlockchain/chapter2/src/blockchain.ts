import * as CryptoJS from 'crypto-js';
import {broadcastLatest} from './p2p';
import {hexToBinary} from './util';

// Block의 Class를 설정한다.
class Block {

    // 블록 구조의 필수적인 요소들에 대한 구현
    public index: number;
    public hash: string;
    public previousHash: string;
    public timestamp: number;
    public data: string;
    public difficulty: number;
    public nonce: number;

    constructor(index:number, hash:string, previousHash: string, 
        timestamp: number, data:string, difficulty: number, nonce: number) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}
// genesisBlock 하드 코딩.
const genesisBlock: Block = new Block(
    0, '816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7', null, 1465154705, 'my genesis block!!', 0, 0
);

// 블록체인의 정보를 받아오는 과정.
// 제네시스 블록을 가장 먼저 받아온다. 블록체인 저장을 시작하는 과정.
let blockchain: Block[] = [genesisBlock];

const getBlockchain = (): Block[] => blockchain;
// 마지막 블록의 정보를 가지고 오는 과정. 현 체인의 길이에서 - 1 을 한 index를 가지고 있는 블록의 정보를 가져옴.
const getLatestBlock = (): Block => blockchain[blockchain.length -1];

// 블록 생성 주기와 난이도 조정 주기
// 블록 생성 주기
const BLOCK_GENERATION_INTERVAL: number = 10;

// 난이도 조정 주기
const DIFFICULTY_ADJUSTMENT_INTERVAL: number = 10;

const getDifficulty = (aBlockchain: Block[]) : number => {
    const latestBlock: Block = aBlockchain[blockchain.length -1];
    if(latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
        return getAdjustedDifficulty(latestBlock, aBlockchain);
    }
    else {
        return latestBlock.difficulty;
    }
};
const getAdjustedDifficulty = (latestBlock: Block, aBlockchain: Block[]) => {
    const prevAdjustmentBlock: Block = aBlockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken: number = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
    if(timeTaken < timeExpected / 2) {
        return prevAdjustmentBlock.difficulty + 1;
    }
    else if(timeTaken > timeExpected * 2) {
        return prevAdjustmentBlock.difficulty -1;
    }
    else {
        return prevAdjustmentBlock.difficulty;
    }
};

const getCurrentTimestamp = (): number => Math.round(new Date().getTime() / 1000);

// 블록을 생성하는 과정.
const generateNextBlock = (blockData: string) => {
    const previousBlock: Block = getLatestBlock();  // 새로운 블록을 만들 때 그 전 블록으로 현 체인의 마지막 블록을 설정한다.
    const difficulty: number = getDifficulty(getBlockchain());
    console.log('difficulty: ' + difficulty);
    const nextIndex: number = previousBlock.index + 1;  // index를 설정하는 과정
    const nextTimestamp: number = new Date().getTime() / 1000;    // timestamp를 설정하는 과정
    const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
    addBlock(newBlock);
    broadcastLatest();  // import 한 {broadcastLatest} 사용.
    return newBlock;
};

// 유요한 블록 생성.
const findBlock = (index:number, previousHash: string, timestamp: number, data: string, difficulty: number) : Block => {
    // nonce를 0으로 먼저 설정.
    let nonce = 0;
    while (true) {
        const hash: string = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
        // hashMathcedDifficulty 사용. 조건문이 true일때까지 반복
        if(hashMatchesDifficulty(hash, difficulty)) {
            return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
        }
        nonce ++;
    }
};

const calculateHashForBlock = (block: Block): string =>
calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);
// block의 구성요소들로 hash 값 생성하는 과정.
const calculateHash = (index: number, previousHash: string, timestamp: number, data: string, difficulty: number, nonce: number): string =>
CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
// 새로운 블록 더함
const addBlock = (newBlock: Block) => {
    // 새롭게 추가될 블록이 유효한 것인지를 확인하는 과정이다.
    if(isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};
// 블록 구조의 유효성 판단.
const isValidBlockStructure = (block: Block): boolean => {
    // 정의된 요소들의 각 항과 일치한지 검사.
    return typeof block.index === 'number' 
    && typeof block.hash === 'string' 
    && typeof block.previousHash === 'string' 
    && typeof block.timestamp === 'number' 
    && typeof block.data === 'string';
};

const isValidNewBlock = (newBlock: Block, previousBlock: Block): boolean => {
    if(!isValidBlockStructure(newBlock)) {
        console.log('invalid structure');
        return false;
    }
    // 블록의 index에 이전 블록의 index보다 1이 커야 한다. 그렇지 않으면, false를 반환.
    if(previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }
    // 블록의 previousHash와 이전 블록의 hash가 일치해야 한다. 그렇지 않으면, false를 반환.
    else if(previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    }
    // 블록의 hash 값 자체가 유효해야한다. 그렇지 않으면, false.
    else if(!isValidTimestamp(newBlock, previousBlock)) {
        console.log('invalid timestamp');
        return false;
    }
    else if(!hasValidHash(newBlock)) {
        return false;
    }
    return true;
};

const getAccumulatedDifficulty = (aBlockchain: Block[]) : number => {
    return aBlockchain
    .map((block) => block.difficulty)
    .map((difficulty) => Math.pow(2, difficulty))
    .reduce((a,b) => a+b);
};
 
const isValidTimestamp = (newBlock: Block, previousBlock: Block) : boolean => {
    return (previousBlock.timestamp - 60 < newBlock.timestamp)
    && newBlock.timestamp - 60 < getCurrentTimestamp();
};

const hasValidHash = (block: Block) : boolean => {
    if(!hashMatchesBlockContent(block)) {
        console.log('invalid hash, got: ' + block.hash);
        return false;
    }

    if(!hashMatchesDifficulty(block.hash, block.difficulty)) {
        console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
    }
    return true;
};

const hashMatchesBlockContent = (block: Block) : boolean => {
    const blockHash: string = calculateHashForBlock(block);
    return blockHash === block.hash;
};

// hash 값이 올바른지 검증.
const hashMatchesDifficulty = (hash: string, difficulty: number) : boolean => {
    // 16진수 hash값을 2진으로 교체.
    const hashInBinary: string = hexToBinary(hash);
    // 난이도만큼의 개수의 0이 앞에 나오는가 확인.
    const requiredPrefix: string = '0'.repeat(difficulty);
    // 2진으로 바뀐 hash값의 맨 앞에 난이도만큼의 개수의 0이 나오는지 확인.
    return hashInBinary.startsWith(requiredPrefix);
};

// 체인의 유효성 검사
const isValidChain = (blockchainToValidate: Block[]):boolean => {
    // 체인의 첫번째 블록이 genesisBlock과 일치하는지 확인.
    const isValidGenesis = (block: Block):boolean => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };
    if(!isValidGenesis(blockchainToValidate[0])){
        return false;
    }
    // isValidNewBlock을 통해 전체 체인 검증.
    for(let i=1; i< blockchainToValidate.length; i++) {
        if(!isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i-1])) {
            return false;
        }
    }
    return true;
};

const addBlockToChain = (newBlock: Block) => {
    if(isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
        return true;
    }
    return false;
};

const replaceChain = (newBlocks: Block[]) => {
    // getBlockchain과 isValidChain을 사용
    // 새로운 chain이 유효한 chain이고 그 chain이 기존의 것보다 더 길면 교체.
    if(isValidChain(newBlocks) && getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcastLatest();
    }
    else {
        console.log('Received blockchain invalid');
    }
};

export {Block, getBlockchain, getLatestBlock, generateNextBlock, isValidBlockStructure, replaceChain, addBlockToChain};