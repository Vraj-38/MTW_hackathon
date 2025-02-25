from fastapi import FastAPI
from query import router  # Import the query router

app = FastAPI()

# Include the API route
app.include_router(router)
