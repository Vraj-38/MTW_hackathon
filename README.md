# MTW_hackathon

https://github.com/Vraj-38/MTW_hackathon

# WhatsApp Bot - AnythingRBI

## Overview
A WhatsApp bot that provides feedback from RBI master circulars, built using LangChain, Pinecone, and OpenAI.

## Features
- 📲 Interact with the bot directly through WhatsApp
- 🔒 Only works for white-listed numbers
- 📄 Retrieves and processes RBI master circulars
- 🤖 Intelligent responses using AI models

## Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file and add your keys:
   ```
   OPENAI_API_KEY=your-openai-api-key
   PINECONE_API_KEY=your-pinecone-api-key
   COHERE_API_KEY=your-cohere-api-key
   ```

4. **Run the bot:**
   ```bash
   node index.js
   ```

5. **Scan QR code:**
   - A QR code will appear in your terminal.
   - Open WhatsApp on your phone.
   - Go to **Linked Devices** > **Link a Device** and scan the QR code.

6. **Start chatting:**
   - Ensure your number is white-listed.
   - Send a message to the bot.
   - Choose from the available options and see the results.

## Dependencies
- `langchain`
- `langchain-pinecone`
- `langchain-openai`
- `langchain-cohere`
- `langchain-core`
- `pinecone-client`
- `whatsapp-web.js`
- `qrcode-terminal`
- `pdfkit`
- `fs`
- `path`
- `os`
- `docx`
- `mongoose`

## Notes
- Ensure your OpenAI, Pinecone, and Cohere API keys are valid.
- Only pre-approved (white-listed) numbers can interact with the bot.
- Restart the bot if the QR code expires.

## License
This project is licensed under the MIT License.

---

Contributions are welcome! Feel free to open an issue or pull request.

Run remaining codes individually.

