import * as bodyParser from 'body-parser';
import * as express from 'express';

import {Block, generateNextBlock, getBlockchain} from './blockchain';
import {connectToPeers, getSockets, initP2PServer} from './p2p';

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (myHttpPort:Number) => {
    const app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });
    // 블록 채굴.
    app.post('/mineBlock', (req, res) => {
        const newBlock: Block = generateNextBlock(req.body.data);
        res.send(newBlock);
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