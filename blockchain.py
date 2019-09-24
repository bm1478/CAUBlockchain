class Blockchain(object):
    def __init__(self):
        self.chain=[]
        self.current_transactions=[]

    def new_block(self):
        #Creates a new Block and adds it to the chain
        pass

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

    @staticmethod
    def hash(block):
        #Hashes a Block
        pass

    @property
    def last_blcok(self):
        #Returns the last Block in the chain
        pass