
import os
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
from langchain_ollama import OllamaEmbeddings


# Load environment variables
load_dotenv()
print("Environment variables loaded")

def process_pdfs(pdf_path: str):
   
    
    embeddings=OllamaEmbeddings(model='nomic-embed-text')
    print("Initialized OllamaEmbeddings")

    # Configure Pinecone
    pc = Pinecone(
        api_key="pcsk_4CUCuw_EpELz57L7jf5qiiEtQa7kgxLfP9g8YLzvps7V3yXavp5hL63ZCFGs5TNYw6Hsfq"
    )
    print("Configured Pinecone")
    index_name = "pdf-chatbot"
    
    # Check if the index exists, create if it does not
    if index_name not in pc.list_indexes().names():
        pc.create_index(
            name=index_name,
            dimension=768,  # Use the correct dimension
            metric='euclidean',
            spec=ServerlessSpec(
                cloud='aws',
                region='us-east-1'
            )
        )
        print(f"Created Pinecone index: {index_name}")
    else:
        print(f"Pinecone index {index_name} already exists")
    
    # Load PDF
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    print(f"Loaded PDF: {pdf_path}")
    
    # Split text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    chunks = text_splitter.split_documents(documents)
    print(f"Split text into {len(chunks)} chunks")
    
    # Store embeddings in Pinecone
    PineconeVectorStore.from_documents(
        chunks,
        embeddings,
        index_name=index_name
    )
    print(f"Stored embeddings in Pinecone for {os.path.basename(pdf_path)}")

if __name__ == "__main__":
    pdf_directory = "./Documents NCPI Hackathon"

    if not os.path.exists(pdf_directory):
        os.makedirs(pdf_directory)
        print(f"Created directory: {pdf_directory}")
        
    for pdf_file in os.listdir(pdf_directory):
        if pdf_file.endswith(".PDF"):
            pdf_path = os.path.join(pdf_directory, pdf_file)
            print(f"Processing file: {pdf_path}")
            process_pdfs(pdf_path)