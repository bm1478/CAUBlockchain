import * as CryptoJS from 'crypto-js';
import {broadcastLatest} from './p2p';

// Block의 Class를 설정한다.
class Block {

    // 블록 구조의 필수적인 요소들에 대한 구현
    public index: number;
    public hash: string;
    public previousHash: string;
    public timestamp: number;
    public data: string;

    constructor(index:number, hash:string, previousHash: string, timestamp: number, data:string) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
    }
}
// genesisBlock 하드 코딩.
const genesisBlock: Block = new Block(
    0, '816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7', null, 1465154705, 'my genesis block!!'
);

// 블록체인의 정보를 받아오는 과정.
// 제네시스 블록을 가장 먼저 받아온다. 블록체인 저장을 시작하는 과정.
let blockchain: Block[] = [genesisBlock];

const getBlockchain = (): Block[] => blockchain;
// 마지막 블록의 정보를 가지고 오는 과정. 현 체인의 길이에서 - 1 을 한 index를 가지고 있는 블록의 정보를 가져옴.
const getLatestBlock = (): Block => blockchain[blockchain.length -1];

// 블록을 생성하는 과정.
const generateNextBlock = (blockData: string) => {
    const previousBlock: Block = getLatestBlock();  // 새로운 블록을 만들 때 그 전 블록으로 현 체인의 마지막 블록을 설정한다.
    const nextIndex: number = previousBlock.index + 1;  // index를 설정하는 과정
    const nextTimestamp: number = new Date().getTime() / 1000;    // timestamp를 설정하는 과정

    // calculateHash로 해시값 계산
    const nextHash: string = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    // Block 에 맞게 index, hash, previousHash, timestmap. data 순으로 정보를 기입하고 hash 는 위의 nextHash 값을 가지고 옴.
    const newBlock: Block = new Block(nextIndex, nextHash, previousBlock.hash, nextTimestamp, blockData);
    addBlock(newBlock);
    broadcastLatest();  // import 한 {broadcastLatest} 사용.
    return newBlock;
}

const calculateHashForBlock = (block: Block): string =>
calculateHash(block.index, block.previousHash, block.timestamp, block.data);
// block의 구성요소들로 hash 값 생성하는 과정.
const calculateHash = (index: number, previousHash: string, timestamp: number, data: string): string =>
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
    else if(calculateHashForBlock(newBlock)!==newBlock.hash) {
        console.log(typeof(newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
}


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
    if(isValidChain(newBlocks) && newBlocks.length > getBlockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcastLatest();
    }
    else {
        console.log('Received blockchain invalid');
    }
};


export {Block, getBlockchain, getLatestBlock, generateNextBlock, isValidBlockStructure, replaceChain, addBlockToChain};