const { PineconeStore } = require("@langchain/pinecone");
const { CohereEmbeddings } = require("@langchain/cohere");
const { ChatGroq } = require("@langchain/groq");
const { Pinecone } = require("@pinecone-database/pinecone");
const { CohereRerank } = require("@langchain/cohere");
const { ChatMessageHistory } = require("langchain/memory");
const { BufferMemory } = require("langchain/memory");
const { PromptTemplate } = require("@langchain/core/prompts");
const { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence, RunnablePassthrough } = require("@langchain/core/runnables");
const { Client, MessageMedia } = require("whatsapp-web.js");
const { EnsembleRetriever } = require("langchain/retrievers/ensemble");
const qrcode = require("qrcode-terminal");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');
const docx = require('docx');
const { Document, Paragraph, HeadingLevel, PageOrientation, AlignmentType } = docx;
const { ChatOpenAI } = require("@langchain/openai");

const CONFIG = {
    OPENAI_API_KEY: "*key hidden*",// Replace with your actual OpenAI API key
    OPENAI_MODEL: "gpt-4-turbo", 
    PINECONE_API_KEY: "pcsk_4CUCuw_EpELz57L7jf5qiiEtQa7kgxLfP9g8YLzvps7V3yXavp5hL63ZCFGs5TNYw6Hsfq",
    PINECONE_ENVIRONMENT: "us-east-1",
    COHERE_API_KEY: "lVObnIfsfWvEpYTBbbDhbAuAhjoHThgVQ6T6REJQ",
    PINECONE_INDEX: "pdf-chatbot",
    RETRY_OPTIONS: {
        maxRetries: 3,
        retryDelay: 1000,
    },
    // Static list of allowed numbers
    ALLOWED_NUMBERS: [
        "919819810714", // Meghansh Vora
    ],
    PDF_OPTIONS: {
        margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
        },
        info: {
            Title: 'NavigateAIF Document',
            Author: 'NavigateAIF Assistant'
        }
    },
    WORD_OPTIONS: {
        defaultFont: {
            name: "Calibri",
            size: 11
        },
        pageOrientation: PageOrientation.PORTRAIT,
        margins: {
            top: 1440, // 1 inch in twips
            bottom: 1440,
            left: 1440,
            right: 1440
        }
    },
    // Debug settings
    DEBUG: {
        SHOW_LLM_PROMPTS: true,
        LOG_LEVEL: "verbose" // "minimal", "normal", "verbose"
    }
};

// In-memory storage for chat history and user data
const userLastQuestions = {};
const userChatHistories = {};
const userDetailPreferences = {};

// Setup logger
function logger(level, message, data = null) {
    const timestamp = new Date().toISOString();
    
    if (CONFIG.DEBUG.LOG_LEVEL === "minimal" && level === "debug") {
        return; // Skip debug logs in minimal mode
    }
    
    if (CONFIG.DEBUG.LOG_LEVEL === "normal" && level === "verbose") {
        return; // Skip verbose logs in normal mode
    }
    
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    
    if (data && CONFIG.DEBUG.LOG_LEVEL === "verbose") {
        if (typeof data === 'object') {
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.log(data);
        }
    }
}

// Initialize clients
const whatsappClient = new Client({
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

const pinecone = new Pinecone({
    apiKey: CONFIG.PINECONE_API_KEY,
});

// Initialize Groq model with additional logging capability
const model = new ChatOpenAI({
    apiKey: CONFIG.OPENAI_API_KEY,
    modelName: CONFIG.OPENAI_MODEL,
    temperature: 0,
    callbacks: [
        {
            handleLLMStart: async (llm, prompts) => {
                if (CONFIG.DEBUG.SHOW_LLM_PROMPTS) {
                    logger("info", "Sending request to OpenAI LLM");
                    logger("verbose", "Prompt being sent to OpenAI:", prompts);
                }
            },
            handleLLMEnd: async (output) => {
                if (CONFIG.DEBUG.SHOW_LLM_PROMPTS) {
                    logger("info", "Received response from OpenAI LLM");
                    logger("verbose", "Raw LLM response:", output);
                }
            },
            handleLLMError: async (err) => {
                logger("error", "Error in OpenAI LLM call:", err);
            }
        }
    ]
});


// Using the older Cohere embedding model that consistently produces 768 dimensions
const embeddings = new CohereEmbeddings({
    apiKey: CONFIG.COHERE_API_KEY,
    model: "embed-multilingual-v2.0", // Older model with 768 dimensions
    inputType: "search_document"
});

const cohereRerank = new CohereRerank({
    apiKey: CONFIG.COHERE_API_KEY,
    model: "rerank-english-v3.0",
});

const PROMPT_TEMPLATES = {
    default: ``,
    
    detailed: `
    ANYTHING_RBI_PROMPT = You are AnythingRBI Assistant, providing authoritative guidance on Reserve Bank of India (RBI) regulations and master circulars.
    
    **CORE RESPONSIBILITIES:**
    
    1. **Regulatory Excellence**  
       - Integrate all relevant RBI master circulars and notifications  
       - Support claims with specific references to master circulars  
       - Include precise requirements, limits, and deadlines  
       - Address regulatory ambiguities with clear rationale  
    
    2. **Documentation Standards**  
       - Begin with "*Key Circulars: [list]*"  
       - Use "*RBI Master Circular - [Circular Name], [Date]*"  
       - Format quotes: "*[Circular Name] states: [quote]*"  
       - Mention amendments and updates with dates  
       - Include practical banking and financial examples  
    
    3. **Message Format**  
       **Overview**  
       [Concise summary of key points]  
       ___  
    
       **Key Circulars**  
       - Primary circulars  
       - Key requirements  
       ___  
    
       **Detailed Analysis**  
       1. [Primary Topic]  
          - Requirements  
          - Obligations  
          - Implementation  
    
       2. [Secondary Topic]  
          [Continue format]  
       ___  
    
       **Action Steps**  
       - Implementation guide  
       - Key challenges  
       - Best practices  
       ___  
    
       **Compliance Summary**  
       - Critical deadlines  
       - Required actions  
       - Key checkpoints  
       ___  
    
    4. **Additional Features**  
       - Include case examples  
       - Add compliance tips  
       - Provide step-by-step implementation strategies  
       - Reference recent RBI notifications  
       - Highlight changes in policies  
       - Share industry best practices  
    
    **PARAMETERS:**  
    - **Focus:** Indian banking and financial regulations (RBI)  
    - **Timeline:** Current financial year  
    - **Approach:** Conservative interpretation  
    - **Priority:** Practical compliance guidance  
    
    **FORMAT RULES:**  
    1. Use *single asterisks* for emphasis  
    2. Use simple dashes (-) for bullets  
    3. Use numbers (1., 2.) for sequences  
    4. Separate sections with "___"  
    5. Keep formatting WhatsApp-compatible  
    6. Avoid use of any checklists  
    
    **CONTEXT:**  
    {context}  
    
    **QUERY:**  
    {question}  

`,
    
    summary: `

**ANYTHING_RBI Assistant** — Providing concise, accurate analysis on RBI master circulars and regulations.  

**CORE RESPONSIBILITIES:**  

1. **Regulatory Accuracy**  
   - Provide key points from relevant RBI master circulars and notifications  
   - Include essential circular references  
   - State critical numerical requirements and deadlines  
   - Highlight any major regulatory uncertainties  

2. **Documentation Standards**  
   - Start with "*Key Circulars: [essential documents only]*"  
   - Include circular names and dates: "*RBI Master Circular - [Circular Name], [Date]*"  
   - Quote only the most essential regulatory text: "*[Circular Name] states: [quote]*"  

3. **WhatsApp Optimization**  
   - Use *single asterisks* for bold text  
   - Use simple dashes (-) for bullets  
   - Separate sections with "___"  
   - Keep formatting simple  
   - Ensure WhatsApp compatibility  

4. **Summary Framework**  
   *Quick Overview*  
   [3-4 key points only]  
   ___  

   *Essential Circulars*  
   - Core circulars  
   - Critical compliance requirements  
   ___  

   *Key Requirements*  
   1. [Primary requirement]  
      - Essential obligations  
      - Key deadlines  

   2. [Secondary requirement]  
      - Critical points only  
   ___  

   *Action Items*  
   - Must-do steps  
   - Important deadlines  
   - Critical compliance points  
   ___  

**OPERATING PARAMETERS:**  
- **Focus:** RBI regulations and master circulars  
- **Timeline:** Current financial year  
- **Approach:** Conservative interpretation  
- **Priority:** Clear, actionable guidance  

**CONTEXT INPUTS:**  
{context}  

**QUERY:**  
Please provide a concise summary of: {question}  

*Note:* Focus on essential requirements and immediate action items only. Maintain regulatory accuracy while being brief.  
`,
document: `

You are AnythingRBI Assistant, a legal document specialist for Reserve Bank of India (RBI) regulations and master circulars. Your primary task is to:

Make sure to not use any bold letters or indents in the final output.

1. ANALYZE THE QUERY:  
- Identify the core legal/regulatory need in the user's question  
- Determine what type of legal document would best address their requirement  
- Identify relevant RBI master circulars, notifications, and compliance requirements  

2. DOCUMENT SELECTION:  
Based on the query analysis, select the most appropriate document type:  
- Application/Form (for regulatory submissions)  
- Legal Agreement/Contract  
- Undertaking/Declaration  
- Notice/Circular  
- Compliance Report  
- Board Resolution  
- Letter to Regulatory Authority  
- Customer/Stakeholder Communication  
- Other formal communications  

3. DOCUMENT STRUCTURE:  
Generate the selected document following standard Indian legal format:  

[DOCUMENT TITLE IN CAPS]  
Reference: [Reference Number]/[Year]  
Date: [Current Date]  

To,  
[Recipient Details if applicable]  
[Address if applicable]  

Subject: [Clear subject line]  

[Appropriate Salutation]  

[Document Body following appropriate legal format]  
- Include all mandatory clauses and sections  
- Reference relevant circulars and notifications  
- Include specific dates, timelines, and requirements  
- Use proper legal language and terminology  

[Closing]  
[Signature Block]  

4. COMPLIANCE REQUIREMENTS:  
- Include all mandatory declarations  
- Add necessary attestation/witness sections if required  
- Include regulatory reference numbers  
- Add required disclaimers and notices  

5. FORMATTING RULES:  
- Use standard legal document formatting  
- Include proper spacing and margins  
- Number paragraphs and sub-paragraphs appropriately  
- Use formal legal language  
- Include footer with page numbers if multiple pages  

CONTEXT:  
{context}  

USER QUERY:  
{question}  

Based on the above query, analyze the requirement and generate an appropriate legal document that complies with RBI regulations and master circulars. The document should be complete, legally valid, and ready for use after proper execution.  

Note: Generate only the document content. Do not include explanations or commentary about the document. Focus on creating a legally compliant, properly formatted document that directly addresses the user's requirement.  
`
};

async function generatePDF(content, filename) {
    logger("info", `Generating PDF: ${filename}`);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument(CONFIG.PDF_OPTIONS);
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'navigateaif-'));
        const outputPath = path.join(tempDir, filename);
        
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Add header
        doc.fontSize(20)
           .text('NavigateAIF Document', { align: 'center' })
           .moveDown(2);

        // Add date
        doc.fontSize(12)
           .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
           .moveDown(2);

        // Add content
        doc.fontSize(12)
           .text(content, {
               align: 'left',
               columns: 1,
               lineGap: 5
           });

        // Add footer
        doc.fontSize(10)
           .text('Generated by NavigateAIF Assistant', {
               align: 'center',
               bottom: 30
           });

        doc.end();

        stream.on('finish', () => {
            logger("info", `PDF generated successfully at: ${outputPath}`);
            resolve(outputPath);
        });
        stream.on('error', (error) => {
            logger("error", "Error generating PDF", error);
            reject(error);
        });
    });
}

async function processRetrievedDocuments(documents, query) {
    if (!documents || documents.length === 0) {
        logger("warn", "No documents found for query", query);
        return [];
    }

    try {
        // Log retrieved document count to help with debugging
        logger("info", `Processing ${documents.length} retrieved documents for query: "${query}"`);
        
        // Transform documents for reranking while preserving original content
        const documentsForRerank = documents.map((doc, idx) => {
            const content = doc.pageContent || '';
            logger("verbose", `Document ${idx+1} length: ${content.length} chars`);
            return {
                text: content,
                metadata: doc.metadata || {},
                pageContent: content,
                index: idx // Assign index for tracking
            };
        });

        logger("info", "Sending documents for reranking with Cohere");
        const rerankedResults = await cohereRerank.rerank(documentsForRerank, query, {
            topN: Math.min(30, documentsForRerank.length) // Ensure we don't request more than available
        });

        const processedResults = rerankedResults.map((result, index) => {
            const originalDoc = documentsForRerank[result.index];
            const content = originalDoc.text || originalDoc.pageContent || '';
            
            return {
                pageContent: content,
                metadata: originalDoc.metadata,
                relevanceScore: result.relevanceScore
            };
        });

        logger("info", `Reranked and returning ${processedResults.length} documents`);
        logger("verbose", "Top document score:", processedResults[0]?.relevanceScore);
        
        return processedResults;

    } catch (error) {
        logger("error", "Error during document reranking:", error);
        logger("info", "Falling back to original document order");
        return documents; // Return original documents if reranking fails
    }
}

async function createRAGChain(retriever, detailLevel = 'default') {
    logger("info", `Creating RAG chain with detail level: ${detailLevel}`);
    
    const retrieverChain = RunnableSequence.from([
        new RunnablePassthrough(),
        async (query) => {
            logger("info", `Processing query in retriever chain: "${query}"`);
            
            try {
                logger("info", "Retrieving documents from vector store");
                const results = await retriever.invoke(query);
                logger("info", `Retrieved ${results.length} documents from vector store`);
                
                const rerankedDocs = await processRetrievedDocuments(results, query);
                
                const context = rerankedDocs
                    .map((doc, index) => {
                        const source = doc.metadata?.pdf_name || 'unknown';
                        const score = doc.relevanceScore ? ` | Score: ${doc.relevanceScore.toFixed(4)}` : '';
                        return `[Source: ${source}${score}]\n${doc.pageContent}`;
                    })
                    .filter(content => content.trim().length > 0)
                    .join('\n\n---\n\n');
                
                logger("info", `Built context with ${rerankedDocs.length} documents, total length: ${context.length} chars`);
                logger("verbose", "Context sample:", context.substring(0, 500) + (context.length > 500 ? "..." : ""));
                
                return { context };
            } catch (error) {
                logger("error", "Error in retriever chain:", error);
                logger("info", "Returning empty context due to error");
                return { context: "" };
            }
        }
    ]);

    // Create a chat prompt template for the ChatGroq model
    const systemTemplate = PROMPT_TEMPLATES[detailLevel];
    const chatPrompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemTemplate),
        HumanMessagePromptTemplate.fromTemplate("{question}")
    ]);
    
    const chain = RunnableSequence.from([
        {
            context: retrieverChain,
            question: new RunnablePassthrough()
        },
        chatPrompt,
        model,
        new StringOutputParser()
    ]);

    return async (input) => {
        try {
            logger("info", `RAG chain invoked with input: "${input}"`);
            
            const contextResult = await retrieverChain.invoke(input);
            const promptArgs = {
                context: contextResult.context,
                question: input
            };
            
            logger("info", "Formatting prompt with context and question");
            const fullPrompt = await chatPrompt.formatMessages(promptArgs);
            
            logger("info", "Sending formatted prompt to Groq model");
            const response = await chain.invoke(input);
            
            logger("info", "Received response from Groq");
            logger("verbose", "Response length:", response.length);
            logger("verbose", "Response preview:", response.substring(0, 300) + (response.length > 300 ? "..." : ""));
            
            return {
                text: response,
                context: contextResult.context,
                fullPrompt
            };
        } catch (error) {
            logger("error", "Error in chain execution:", error);
            throw error;
        }
    };
}

async function setupRetriever() {
    try {
        logger("info", "Setting up main retriever...");
        
        // Create a single retriever for the entire index
        logger("info", `Connecting to Pinecone index: ${CONFIG.PINECONE_INDEX}`);
        const index = pinecone.Index(CONFIG.PINECONE_INDEX);
        
        // Log some debugging information
        logger("info", "Using Cohere embeddings model for vector similarity search");
        logger("info", `Embedding model: embed-multilingual-v2.0 (768 dimensions)`);
        
        logger("info", "Creating Pinecone store from existing index");
        const store = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            namespace: "", // Using empty namespace if not specified
            textKey: "text", // Make sure this matches the field name in your vectors
        });
        
        // Use a single retriever with a higher k value to get more documents
        logger("info", "Creating retriever with k=50");
        const retriever = store.asRetriever({ k: 50 });
        
        // Create the RAG chain with the unified retriever
        logger("info", "Creating main RAG chain");
        const mainChain = await createRAGChain(retriever);

        logger("info", "Successfully set up main retriever and RAG chain");

        return { mainChain, retriever };
    } catch (error) {
        logger("error", "Error in setupRetriever:", error);
        logger("error", "Error details:", error.message);
        if (error.cause) {
            logger("error", "Cause:", error.cause);
        }
        throw error;
    }
}

async function generateWordDoc(content, filename) {
    logger("info", `Generating Word document: ${filename}`);
    return new Promise((resolve, reject) => {
        try {
            // Create sections from content
            const contentParagraphs = content.split('\n').map(text => 
                new Paragraph({
                    text: text,
                    spacing: {
                        before: 200,
                        after: 200,
                        line: 276
                    }
                })
            );

            const doc = new Document({
                sections: [{
                    properties: {
                        page: {
                            margin: {
                                top: 1440,
                                bottom: 1440,
                                left: 1440,
                                right: 1440
                            },
                            orientation: PageOrientation.PORTRAIT
                        }
                    },
                    children: [
                        new Paragraph({
                            text: "NavigateAIF Document",
                            heading: HeadingLevel.HEADING_1,
                            alignment: AlignmentType.CENTER,
                            spacing: {
                                before: 240,
                                after: 240
                            }
                        }),
                        new Paragraph({
                            text: `Date: ${new Date().toLocaleDateString()}`,
                            alignment: AlignmentType.RIGHT,
                            spacing: {
                                before: 240,
                                after: 480
                            }
                        }),
                        ...contentParagraphs,
                        new Paragraph({
                            text: "Generated by NavigateAIF Assistant",
                            alignment: AlignmentType.CENTER,
                            spacing: {
                                before: 480,
                                after: 240
                            }
                        })
                    ],
                }],
            });

            // Create temp directory
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'navigateaif-'));
            const outputPath = path.join(tempDir, filename);

            // Use docx.Packer to save the document
            docx.Packer.toBuffer(doc).then((buffer) => {
                fs.writeFileSync(outputPath, buffer);
                logger("info", `Word document generated successfully at: ${outputPath}`);
                resolve(outputPath);
            }).catch((error) => {
                logger("error", "Error generating Word document:", error);
                reject(error);
            });

        } catch (error) {
            logger("error", "Error in Word document generation:", error);
            reject(error);
        }
    });
}

function generateDocumentName(question, extension) {
    // Extract key words from the question (first 3-4 significant words)
    const words = question
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .split(/\s+/) // Split by whitespace
        .filter(word => 
            // Filter out common words
            !['what', 'how', 'when', 'where', 'why', 'is', 'are', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of'].includes(word)
        )
        .slice(0, 4) // Take first 4 significant words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)); // Capitalize first letter

    // Create filename with NavigateAIF prefix
    const topicPart = words.join('_');
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    return `NavigateAIF_${topicPart}_${date}${extension}`;
}

async function handleMessage(message, mainChain, retriever) {
    const senderNumber = message.from.replace("@c.us", "");

    // Debug: Log all incoming messages
    logger("info", `Received message from ${senderNumber}: "${message.body}"`);

    // Check if number is allowed using the static list
    if (!CONFIG.ALLOWED_NUMBERS.includes(senderNumber)) {
        await message.reply("Sorry, you are not authorized to use this service.");
        return;
    }

    const messageText = message.body.trim();
    
    try {
        // Initialize chat history if it doesn't exist
        if (!userChatHistories[senderNumber]) {
            logger("info", `Creating new chat history for user ${senderNumber}`);
            userChatHistories[senderNumber] = new ChatMessageHistory();
        }

        const memory = new BufferMemory({
            chatHistory: userChatHistories[senderNumber],
            returnMessages: true,
            memoryKey: "chat_history"
        });

        // Handle option selections (1-4)
        if (['1', '2', '3', '4'].includes(messageText)) {
            logger("info", `User selected option: ${messageText}`);
            const lastQuestion = userLastQuestions[senderNumber];
            
            if (!lastQuestion) {
                logger("warn", "No previous question found for user");
                await message.reply("I couldn't find your previous question. Please ask your question again.");
                return;
            }

            // Send immediate acknowledgment
            await message.reply(`Option ${messageText} selected. Processing your request...`);
            
            // Set detail level based on option
            const detailLevel = ['1', '3', '4'].includes(messageText) ? 'detailed' : 'summary';
            
            // Process response with timeout protection
            try {
                // Create specialized chain for the selected option
                const specializedChain = await Promise.race([
                    createRAGChain(retriever, detailLevel),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Chain creation timed out")), 30000))
                ]);
                
                // Generate response with timeout
                const responsePromise = specializedChain(lastQuestion);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Response generation timed out")), 60000)
                );
                
                const textResponse = await Promise.race([responsePromise, timeoutPromise]);
                
                // Send text response
                await message.reply(textResponse.text);
                
                // Update chat history asynchronously (don't await)
                memory.saveContext(
                    { input: lastQuestion },
                    { output: textResponse.text }
                ).catch(err => logger("error", "Failed to save to chat history", err));
                
                // Handle document generation for options 3 and 4
                if (['3', '4'].includes(messageText)) {
                    await message.reply("Now generating your document. Please wait...");
                    
                    try {
                        // Create document chain with timeout
                        const documentChain = await Promise.race([
                            createRAGChain(retriever, 'document'),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Document chain creation timed out")), 30000))
                        ]);
                        
                        // Generate document content with timeout
                        const documentResponse = await Promise.race([
                            documentChain(lastQuestion),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Document generation timed out")), 60000))
                        ]);
                        
                        // Generate the actual file
                        const extension = messageText === '3' ? '.pdf' : '.docx';
                        const filename = generateDocumentName(lastQuestion, extension);
                        const generateFunc = messageText === '3' ? generatePDF : generateWordDoc;
                        const docType = messageText === '3' ? 'PDF' : 'Word document';
                        
                        // Generate document with timeout
                        const docPath = await Promise.race([
                            generateFunc(documentResponse.text, filename),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("File generation timed out")), 45000))
                        ]);
                        
                        // Create and send media
                        const media = MessageMedia.fromFilePath(docPath);
                        await message.reply(media, undefined, { 
                            caption: `Here's your ${docType} on ` + 
                                    lastQuestion.slice(0, 50) + 
                                    (lastQuestion.length > 50 ? "..." : "")
                        });
                        
                        // Cleanup files (don't await)
                        setTimeout(() => {
                            try {
                                fs.unlinkSync(docPath);
                                fs.rmdirSync(path.dirname(docPath));
                            } catch (cleanupError) {
                                logger("error", "Error during cleanup", cleanupError);
                            }
                        }, 5000);
                        
                    } catch (docError) {
                        logger("error", "Document generation error", docError);
                        await message.reply(`I apologize, but there was an error with the ${messageText === '3' ? 'PDF' : 'Word'} document. The text response has been provided above.`);
                    }
                }
                
            } catch (optionError) {
                logger("error", "Error processing option", optionError);
                await message.reply("I apologize, but there was an error processing your request. Please try again later.");
            }
            
            return;
        }

        // Handle regular questions
        logger("info", `Processing regular question: "${messageText}"`);
        
        // Let user know processing is underway
        await message.reply("Processing your question. This may take a moment...");
        
        try {
            // Generate response with timeout protection
            const responsePromise = mainChain(messageText);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Response generation timed out")), 60000)
            );
            
            const response = await Promise.race([responsePromise, timeoutPromise]);
            
            // Store this question for later reference
            userLastQuestions[senderNumber] = messageText;
            
            // Update chat history asynchronously (don't await)
            memory.saveContext({ input: messageText }, { output: response.text })
                .catch(err => logger("error", "Failed to save to chat history", err));
            
            // Send response
            await message.reply(response.text);
            
            // Send interactive options after the response
            await message.reply(
                "Would you like:\n\n" +
                "1. Detailed response \n" +
                "2. Summary response \n" +
                "3. Detailed response with PDF document \n" +
                "4. Detailed response with Word document\n\n" +
                "Reply with '1', '2', '3', or '4' to select your preferred format."
            );
            
        } catch (error) {
            logger("error", "Error in main question flow", error);
            await message.reply("I apologize, but there was an error generating a response. Please try again later.");
        }

    } catch (error) {
        logger("error", "Critical error in handleMessage", error);
        
        // Attempt to send a response even if there's an error
        try {
            await message.reply("I apologize, but I'm experiencing technical difficulties. Please try again later.");
        } catch (replyError) {
            logger("error", "Failed to send error message", replyError);
        }
    }
}

whatsappClient.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    logger("info", 'QR CODE generated. Please scan with WhatsApp.');
});

whatsappClient.on("ready", () => {
    logger("info", "WhatsApp client is ready!");
});

whatsappClient.on('authenticated', () => {
    logger("info", 'AUTHENTICATED');
});

whatsappClient.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

async function main() {
    try {
        console.log("Initializing WhatsApp client...");
        await whatsappClient.initialize();
        
        console.log("Setting up retriever...");
        const { mainChain, retriever } = await setupRetriever();

        whatsappClient.on("message", async (message) => {
            await handleMessage(message, mainChain, retriever);
        });

        console.log("Bot is ready to receive messages!");
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

// Shutdown handler
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    try {
        await whatsappClient.destroy();
        console.log('WhatsApp client destroyed successfully');
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
    process.exit(0);
});

// Start the application
main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});