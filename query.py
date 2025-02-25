import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings # type: ignore
from langchain_pinecone import PineconeVectorStore # type: ignore
from pinecone import Pinecone # type: ignore
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# Initialize Pinecone
api_key = os.getenv("PINECONE_API_KEY")
pc = Pinecone(api_key=api_key)
index_name = "pdf-chatbot"

# Check if index exists
if index_name not in pc.list_indexes().names():
    raise Exception(f"Pinecone index '{index_name}' does not exist. Please create it first.")

# Initialize Embeddings
embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")

# Load the Pinecone vector store
vector_store = PineconeVectorStore(index_name=index_name, embedding=embeddings)

# FastAPI Router
router = APIRouter()

# Define request model
class QueryRequest(BaseModel):
    question: str

@router.post("/ask/")
async def ask_question(request: QueryRequest):
    query = request.question
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Perform similarity search
    results = vector_store.similarity_search(query, k=3)  

    # Extract relevant chunks
    documents = [result.page_content for result in results]
    
    return {"query": query, "documents": documents}
