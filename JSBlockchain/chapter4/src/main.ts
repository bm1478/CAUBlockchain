import * as bodyParser from 'body-parser';
import * as express from 'express';

import {Block, generateNextBlock, generatenextBlockWithTransaction, generateRawNextBlock, getAccountBalance,
    getBlockchain} from './blockchain';
import {connectToPeers, getSockets, initP2PServer} from './p2p';
import {initWallet} from "./wallet";

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (myHttpPort:Number) => {
    const app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });
    // 블록 채굴.
    app.post('/mineRawBlock', (req, res) => {
        if(req.body.data == null) {
            res.send('data parameter is missing');
            return;
        }
        const newBlock: Block = generateRawNextBlock(req.body.data);
        if(newBlock === null) {
            res.status(400).send('could not generate block');
        }
        else {
            res.send(newBlock);
        }
    });

    app.post('/mineBlock', (req, res) => {
        const newBlock: Block = generateNextBlock();
        if(newBlock === null) {
            res.status(400).send('could not generate block');
        }
        else {
            res.send(newBlock);
        }
    });

    app.get('/balance', (req, res) => {
        const balance: number = getAccountBalance();
        res.send({'balance': balance});
    });

    // 거래를 채굴하는 과정.
    app.post('/mineTransaction', (req, res) => {
        const address = req.body.address;
        const amount = req.body.amount;
        // blockchain.ts 에 새로 추가된 함수
        try {
            const resp = generatenextBlockWithTransaction(address, amount);
            res.send(resp);
        } catch(e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    // peer의 list를 보여줌.
    app.get('/peers', (req, res) => {
        res.send(getSockets().map((s:any) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    // peer 를 더한다.
    app.post('/addPeer', (req, res) => {
        connectToPeers(req.body.peer);
        res.send();
    });

    app.listen(myHttpPort, () => {
        console.log('Listening http on port: ' + myHttpPort);
    });
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
initWallet();