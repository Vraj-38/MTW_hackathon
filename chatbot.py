#!/usr/bin/env python
# coding: utf-8

# In[1]:


from fastapi import FastAPI, Form
import requests

# Groq API Key
GROQ_API_KEY = "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"

# FastAPI app
app = FastAPI()


# In[2]:


def get_groq_response(query):
    """Send the query to Groq API and return the response."""
    completion = client.chat.completions.create( # type: ignore
        model="mixtral-8x7b-32768",  # Ensure correct model name
        messages=[{"role": "user", "content": query}],
        temperature=1,
        max_tokens=1024,
        top_p=1,
        stream=False  # Set to False for a single response
    )
    
    return completion.choices[0].message.content


# In[3]:


@app.post("/ask/")
async def ask_question(query: str = Form(...)):
    """API endpoint to process queries using Groq."""
    response = get_groq_response(query)
    return {"question": query, "answer": response}


# In[ ]:




