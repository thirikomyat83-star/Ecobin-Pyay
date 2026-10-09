import os
import uvicorn
import uuid
import asyncio
import nest_asyncio
import traceback
import httpx
import sqlite3
from fastapi import FastAPI, HTTPException, UploadFile, File 
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

nest_asyncio.apply()

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool, create_retriever_tool
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

import cv2
import numpy as np
from roboflow import Roboflow
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "").strip()

OR_HEADERS = {
    "HTTP-Referer": "https://ecobin-pyay.onrender.com",
    "X-Title": "EcoBin Pyay"
}
safe_http_client = httpx.Client(timeout=httpx.Timeout(60.0))

app = FastAPI(title="EcoBin Pyay Advanced API (Roboflow Cloud Version)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "ecobin.db"

def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users
                     (user_id TEXT PRIMARY KEY, points INTEGER, level INTEGER, total_co2 REAL)''')
        conn.commit()

init_db()

def get_user_from_db(user_id: str):
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("SELECT points, level, total_co2 FROM users WHERE user_id=?", (user_id,))
        return c.fetchone()

def save_user_to_db(user_id: str, points: int, level: int, co2: float):
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO users (user_id, points, level, total_co2) VALUES (?, ?, ?, ?)",
                  (user_id, points, level, co2))
        conn.commit()

vision_model = None
try:
    if ROBOFLOW_API_KEY:
        rf = Roboflow(api_key=ROBOFLOW_API_KEY)
        vision_model = rf.workspace("grad-jhbv7").project("waste-classification-irwkg").version(1).model
        print("✅ Roboflow Model Successfully Connected!")
    else:
        print("⚠️ ROBOFLOW_API_KEY မရှိသေးပါ။")
except Exception as e:
    print("⚠️ Roboflow ချိတ်ဆက်ရာတွင် အခက်အခဲရှိနေပါသည်:", e)

def setup_knowledge_base():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        with open(os.path.join(data_dir, "default_fact.txt"), "w", encoding="utf-8") as f:
            f.write("EcoBin Pyay is a smart waste management system designed to protect Irrawaddy dolphins and the environment. It uses gamification to encourage recycling.")

    documents = []
    loaders = [
        DirectoryLoader(data_dir, glob="**/*.pdf", loader_cls=PyPDFLoader),
        DirectoryLoader(data_dir, glob="**/*.docx", loader_cls=Docx2txtLoader),
        DirectoryLoader(data_dir, glob="**/*.txt", loader_cls=TextLoader)
    ]
    
    for loader in loaders:
        try:
            documents.extend(loader.load())
        except Exception:
            pass

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    docs = text_splitter.split_documents(documents)
    
    try:
        embeddings = OpenAIEmbeddings(
            model="nomic-ai/nomic-embed-text-v1.5",
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENAI_API_KEY,
            default_headers=OR_HEADERS,
            http_client=safe_http_client
        )
        if docs:
            vector_store = FAISS.from_documents(docs, embeddings)
            return vector_store.as_retriever(search_kwargs={"k": 3})
    except Exception as e:
        print("⚠️ Knowledge base build skipped/error:", e)
    return None

kb_retriever = setup_knowledge_base()

tools = []
if kb_retriever:
    tools.append(create_retriever_tool(
        kb_retriever,
        "environmental_knowledge_base",
        "Use this tool to search for official information, environment laws, global warming facts, and details about Irrawaddy dolphins. Translate the concept into Burmese."
    ))

@tool
def get_user_stats(user_id: str) -> str:
    """Check the user's current points, level, and CO2 saved in EcoBin Pyay app."""
    user = get_user_from_db(user_id)
    if user:
        return f"User '{user_id}' has {user[0]} points, is at Level {user[1]}, and saved {user[2]} kg of CO2."
    return f"User '{user_id}' account not found or has 0 points."

@tool
def get_app_rewards_info() -> str:
    """Get information about app rewards in EcoBin Pyay."""
    return "1. KBZPay Cash (1000 Pts = 1000 MMK). 2. Mate Swe Oway Ride (500 Pts = 500 MMK Off). 3. Shwe Min Tha Mee Shopping Voucher (2000 Pts = 2000 MMK Off)."

tools.extend([get_user_stats, get_app_rewards_info])

llm = ChatOpenAI(
    model="openai/gpt-4o-mini",
    temperature=0.4,
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENAI_API_KEY,
    default_headers=OR_HEADERS,
    http_client=safe_http_client
)

system_instruction = """
You are 'Eco-Coach', an intelligent and Kawaii AI assistant for the 'EcoBin Pyay' smart waste management app in Myanmar.
CORE INSTRUCTIONS:
1. TRANSLATE TO BURMESE: YOU MUST GENERATE YOUR FINAL RESPONSE ENTIRELY IN BURMESE.
2. TONE: Be very friendly, encouraging, and use Kawaii emojis (🐬, 🌸, 💖).
3. FORMATTING: You must format your response strictly as a bulleted list. Each point must be on a new line. Do NOT use markdown headers (e.g., #, ##). Do NOT write long paragraphs.
"""

prompt = ChatPromptTemplate.from_messages([
    ("system", system_instruction),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=False)

class SyncRequest(BaseModel):
    user_id: str
    current_points: int
    level: int
    total_co2: float

class ChatRequest(BaseModel):
    user_id: str
    message: str

@app.get("/")
async def read_root():
    return {"message": "EcoBin Pyay API is Live and Running!"}

@app.post("/api/sync")
async def sync_user_state(request: SyncRequest):
    save_user_to_db(request.user_id, request.current_points, request.level, request.total_co2)
    return {"status": "success"}

@app.post("/api/chat")
async def chat_with_eco_coach(request: ChatRequest):
    try:
        user = get_user_from_db(request.user_id)
        if not user:
            save_user_to_db(request.user_id, 0, 1, 0.0)
            
        response = await asyncio.to_thread(
            agent_executor.invoke,
            {"input": f"[User ID: {request.user_id}] \nUser Message: {request.message}"}
        )
        return {"reply": response["output"]}
    except Exception as e:
        print("====== AI CHAT ERROR ======")
        traceback.print_exc()
        print("===========================")
        raise HTTPException(status_code=500, detail="AI အလုပ်များနေပါသည်။")

@app.post("/api/scan")
async def scan_waste(file: UploadFile = File(...)):
    if not vision_model:
        raise HTTPException(status_code=500, detail="Roboflow AI နှင့် ချိတ်ဆက်ထားခြင်း မရှိပါ။")

    temp_filename = f"temp_{uuid.uuid4()}.jpg"
    with open(temp_filename, "wb") as buffer:
        buffer.write(await file.read())

    try:
        prediction = vision_model.predict(temp_filename).json()
        
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

        class_name = "unknown"
        preds = prediction.get('predictions', [])
        if preds and len(preds) > 0:
            if 'top' in preds[0]:
                class_name = preds[0]['top'].lower()
            elif 'predictions' in preds[0] and len(preds[0]['predictions']) > 0:
                class_name = preds[0]['predictions'][0]['class'].lower()

        if class_name == "unknown":
            return {"status": "failed", "message": "အမှိုက်အမျိုးအစားကို သေချာစွာ မဖတ်နိုင်ပါ။"}

        detected_label = "Unknown"
        points = 0
        co2_saved = 0.0

        if "pet" in class_name or "plastic" in class_name or "bottle" in class_name:
            detected_label, points, co2_saved = "ပလတ်စတစ်ဘူး (PET)", 50, 0.08
        elif "can" in class_name or "metal" in class_name or "alu" in class_name:
            detected_label, points, co2_saved = "အချိုရည် သံဘူး", 80, 0.15
        elif "glass" in class_name:
            detected_label, points, co2_saved = "ဖန်ပုလင်း", 100, 0.3
        else:
            detected_label, points, co2_saved = class_name.capitalize(), 10, 0.05

        return {
            "status": "success",
            "name": detected_label,
            "pts": points,
            "co2": co2_saved,
            "label": f"{detected_label} (AI Verified)"
        }
    except Exception as e:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        raise HTTPException(status_code=500, detail="Scan ဖတ်ရာတွင် အခက်အခဲရှိနေပါသည်။")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
