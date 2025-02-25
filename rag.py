import os
from dotenv import load_dotenv
from langchain_ollama import OllamaEmbeddings
from langchain_groq import ChatGroq
from langchain_pinecone import PineconeVectorStore
from langchain.retrievers import BM25Retriever
from langchain.chains import RetrievalQA
from langchain.schema import Document
from pinecone import Pinecone
# Load environment variables
load_dotenv()
print("Environment variables loaded")

def get_answer(question: str) -> str:
    # Initialize components
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    print("Initialized OllamaEmbeddings")

    llm = ChatGroq(
        model="mixtral-8x7b-32768",
        temperature=0.4,
        # other params..
    )
    print("Initialized ChatGroq")
    
    Pinecone(
        api_key="pcsk_4CUCuw_EpELz57L7jf5qiiEtQa7kgxLfP9g8YLzvps7V3yXavp5hL63ZCFGs5TNYw6Hsfq"
    )
    index_name = "pdf-chatbot"

    # Connect to Pinecone
    vector_store = PineconeVectorStore(
        index_name=index_name,
        embedding=embeddings
    )
    print("Connected to Pinecone")

    # BM25 Retriever (for keyword-based search)
    bm25_retriever = BM25Retriever.from_documents(vector_store.similarity_search(question, k=50))
    print("Initialized BM25Retriever")

    # Hybrid Retrieval (Semantic + BM25)
    def hybrid_retriever(query):
        semantic_results = vector_store.similarity_search(query, k=10)
        bm25_results = bm25_retriever.get_relevant_documents(query)
        
        # Combine results (Hybrid Search)
        retrieved_docs = list({doc.page_content: doc for doc in semantic_results + bm25_results}.values())
        return retrieved_docs

    # Create QA chain with reranking
    retriever=vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 5})
    qa = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="map_reduce",
        retriever = retriever

    )
    print("Initialized RetrievalQA")

    # Get answer
    result = qa.invoke(question)
    return result['result']

if __name__ == "__main__":
    while True:
        query = input("\nEnter your question (type 'exit' to quit): ")
        if query.lower() == 'exit':
            break
        answer = get_answer(query)
        print(f"\nAnswer: {answer}")