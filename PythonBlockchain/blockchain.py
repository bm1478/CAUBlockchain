import hashlib
import json
from time import time
from uuid import uuid4
from urllib.parse import urlparse

from flask import Flask, jsonify, request
import requests

class Blockchain(object):
    def __init__(self):
        self.chain=[]
        self.current_transactions=[]
        self.nodes = set()

        #genesis block 생성
        self.new_block(previous_hash=1, proof=100)

    def new_block(self, proof, previous_hash=None):
        """

        블록체인에 새로운 블록 만들기

        :param proof: <int> proof 는 Proof of Work 알고리즘에 의해 제공된다.
        :param previous_hash: (Optinal) <str> 이전 블록의 해쉬값
        :return: <dict> 새로운 블록

        """

        block = {
            'index' : len(self.chain) + 1,
            'timestamp' : time(),
            'transactions' : self.current_transactions,
            'proof' : proof,
            'previous_hash' : previous_hash or self.hash(self.chain[-1]),
        }

        #거래 내역 초기화
        self.current_transactions = []

        self.chain.append(block)
        return block

    def new_transaction(self, sender, recipient, amount):
        #Adds a new transaction to the list of transactions

        """
        Creates a new transaction to go into the next mined Block

        :param sender: <str> Sender의 주소
        :param recipient: <str> Recipient의 주소
        :param amount: <int> Amount
        :return: <int> 이 거래를 포함한 블록의 index 값
        """

        self.current_transactions.append({
            'sender': sender,
            'recipient':recipient,
            'amount': amount,
        })

        return self.last_blcok['index'] + 1

    @property
    def last_blcok(self):
        return self.chain[-1]

    @staticmethod
    def hash(block):
        """
        Creates a SHA-256 hash of a Block

        :param block: <dick> Block
        :return: <str>
        """

        #We must make sure that the Dictionary is Ordered, or we'll have inconsistent hashes
        block_string = json.dumps(block, sort_keys = True).encode()
        return hashlib.sha256(block_string).hexdigest()

    def proof_of_work(self, last_proof):
        """
        POW 알고리즘 설명:
        - 앞에서 0의 개수가 4개가 나오는 hash(pp')을 만족시키는 p'을 찾는다.
        - p 는 이전 블록의 proof, p'는 새로운 블록의 proof

        :param last_proof: <int>
        :return: <int>
        """

        proof = 0
        while self.valid_proof(last_proof, proof) is False:
            proof+=1

        return proof

    @staticmethod
    def valid_proof(last_proof, proof):
        """
        Proof 검증 방법 : hash(last_proof, proof)의 값의 앞의 4자리가 0인가?

        :param last_proof: <int> 이전 블록의 proof 값
        :param proof: <int> 현재 블록의 proof 값
        :return: <bool> 옳다면 true 값 그렇지 않으면 false 값 반환
        """

        guess = f'{last_proof}{proof}'.encode()
        guess_hash = hashlib.sha256(guess).hexdigest()
        return guess_hash[:4] == "0000"

    def register_node(self, address):
        """
        새로운 노드가 기존의 노드의 list에 등록되는 곳이다
        'http://172.0.0.1:5002 와 같은 형태로 등록을 요청하면 된다
        :param address:
        :return:
        """
        parsed_url = urlparse(address)
        self.nodes.add(parsed_url.netloc)

    def valid_chain(self, chain):
        """
        주어진 블록체인이 유효한지를 결정한다.
        :param chain:
        :return:
        """

        last_block = chain[0]
        current_index = 1

        while current_index < len(chain):
            block = chain[current_index]
            print(f'{last_block}')
            print(f'{block}')
            print("\n-----------\n")

            if block['previous_hash'] != self.hash(last_block):
                return False

            if not self.valid_proof(last_block['proof'], block['proof']):
                return False

            last_block = block
            current_index += 1

        return True

    def resolve_conflicts(self):
        """
        이곳이 합의 알고리즘, 노드 중에서 가장 긴 체인을 가지고 있는 노드의 체인을 유효한 것으로 인정한다.
        :return:
        """

        neighbours = self.nodes
        new_chain = None

        max_length = len(self.chain)

        for node in neighbours:
            response = requests.get(f'http://{node}/chain')

            if response.status_code == 200:
                length = response.json()['length']
                chain = response.json()['chain']

                if length > max_length and self.valid_chain(chain) :
                    max_length = length
                    new_chain = chain

            if new_chain:
                self.chain = new_chain
                return True

        return False

# Instantiate our Node
app = Flask(__name__)

# Generate a globally unique address for this node
node_identifier = str(uuid4()).replace('-', '')

# Instantiate the Blockchain
blockchain = Blockchain()


@app.route('/mine', methods = ['GET'])
def mine():
    #다음 블록의 proof 값을 얻어내기 위해 POW 알고리즘을 수행한다.
    last_block = blockchain.last_blcok
    last_proof = last_block['proof']
    proof = blockchain.proof_of_work(last_proof)

    #proof 값을 찾으면 (채굴에 성공하면) 보상을 준다.
    #sender의 주소를 0으로 한다. (원래 거래는 송신자, 수신자가 있어야 하는데 채굴에 대한 보상으로 얻은 코인은 sender 가 없다.)
    blockchain.new_transaction(
        sender = "0",
        recipient=node_identifier,
        amount=1,
    )

    #
    previous_hash = blockchain.hash(last_block)
    block = blockchain.new_block(proof, previous_hash)

    response = {
        'message' : "New Block Forged",
        'index' : block['index'],
        'transactions' : block['transactions'],
        'proof' : block['proof'],
        'previous_hash' : block['previous_hash'],
    }
    return jsonify(response), 200
    #return "We'll mine a new Block

@app.route('/transactions/new', methods = ['POST'])
def new_transactions():
    values = request.get_json()

    #요청된 필드가 POST 된 데이터인지 확인하는
    required = ['sender', 'recipient', 'amount']
    if not all(k in values for k in required):
        return 'Missing values', 400

    #새로운 거래 생성
    index = blockchain.new_transaction(values['sender'], values['recipient'], values['amount'])

    response = {'message' : f'Transaction will be added to Block {index}'}
    return jsonify(response), 201
    #return "We'll mine a new Block"

@app.route('/chain', methods = ['GET'])
def full_chain():
    response = {
        'chain':blockchain.chain,
        'length':len(blockchain.chain),
    }
    return jsonify(response),200
    #return "We'll add a new transaction"

@app.route('/nodes/register', methods = ['POST'])
def register():
    values = request.get_json()
    required = ['nodes']
    if not all(k in values for k in required):
        return 'Missing values', 400
    for i in values['nodes']:
        blockchain.register_node(i)

    response = {'message': f'New nodes have been added',
                'total_nodes': list(blockchain.nodes)
                }
    return jsonify(response), 201


@app.route('/nodes/resolve', methods = ['GET'])
def resolve():
    if blockchain.resolve_conflicts():
        response = {
            'message': "Our chain was replaced",
            'new_chain': blockchain.chain,
            'length': len(blockchain.chain),
        }
    else:
        response = {
            'message': "Our chain fail replaced"
        }
    return jsonify(response), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)



'''
Block의 구조
block = {
    'index' : 1,
    'timestamp' : 1506057125.900785 # UNIX time
    'transactions' : [
    {
        'sender' : "8527147fe1f5426f9dd545de4b27ee00" ,
        'recipient' : "a77f5cdfa2934df3954a5c7c7da5df1f" ,
        'amount' : 5,
    }
  ],
  'proof' : 324984774000,
  'previous_hash': "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
} #json형식
'''

'''
비트코인 PoW Example 해쉬의 끝 0이 되게함.

x=5
y=0 # We don't know what y should be yet...

while sha256(f'{x*y)'.encode()).hexdigest()[-1] != "0";
    y+=1
    
printf(f"The soulution y is {y} ')
-> hash cash
'''

'''
거래 요청
{
    "sender" : "my address",
    "recipent" : "someone else's address",
    "amount" : 5
}
'''