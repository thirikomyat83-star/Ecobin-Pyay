# =====================================================================
# 1. လိုအပ်သော Packages များကို Install လုပ်ခြင်း
# =====================================================================
import os
import nest_asyncio
import uvicorn
import uuid
from fastapi import FastAPI, HTTPException, UploadFile, File # 💡 YOLO ပုံလက်ခံရန် UploadFile, File ထပ်တိုးထားပါသည်
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# --- LangChain Classic / Agent Imports (Legacy Mode) ---
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

# --- LangChain Tools / Core Imports (နေရာအသစ်) ---
from langchain_core.tools import tool
from langchain_core.tools import create_retriever_tool  # 💡 ဤနေရာသို့ ပြောင်းလဲသွားပါသည်

# --- Data & Vector Store Imports ---
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# --- YOLO & Image Processing Imports (YOLO အတွက် ထပ်တိုး) ---
import cv2
import numpy as np
from ultralytics import YOLO

# --- Roboflow Imports (Cloud AI) ---
from roboflow import Roboflow
from dotenv import load_dotenv

# =====================================================================
# 2. API Keys များကို .env မှ ဖတ်ယူခြင်း
# =====================================================================
nest_asyncio.apply()
load_dotenv() # .env ဖိုင်ထဲမှ Key များကို ဆွဲထုတ်ခြင်း

os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
os.environ["OPENAI_API_BASE"] = "https://openrouter.ai/api/v1"

# =====================================================================
# 3. FastAPI Application စတင်တည်ဆောက်ခြင်း
# =====================================================================
app = FastAPI(title="EcoBin Pyay Advanced API (Roboflow Cloud Version)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

USERS_DB = {}

# =====================================================================
# 4. Roboflow AI Scanner ကို လှမ်းချိတ်ခြင်း
# =====================================================================
print("⏳ Loading Roboflow Cloud AI Model...")
try:
    rf = Roboflow(api_key=os.getenv("ROBOFLOW_API_KEY"))
    vision_model = rf.workspace("grad-jhbv7").project("waste-classification-irwkg").version(1).model
    print("✅ Roboflow Model Successfully Connected!")
except Exception as e:
    print("⚠️ Roboflow ချိတ်ဆက်ရာတွင် အခက်အခဲရှိနေပါသည်:", e)
    vision_model = None

# =====================================================================
# 5. Knowledge Base တည်ဆောက်ခြင်း (RAG)
# =====================================================================
def setup_knowledge_base():
    data_dir = "./data"
    
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
        except Exception as e:
            pass

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    docs = text_splitter.split_documents(documents)
    
    embeddings = OpenAIEmbeddings()
    if docs:
        vector_store = FAISS.from_documents(docs, embeddings)
        return vector_store.as_retriever(search_kwargs={"k": 3})
    return None

print("⏳ Building Knowledge Base from ./data folder...")
kb_retriever = setup_knowledge_base()
print("✅ Knowledge Base Successfully Built!")

tools = []
if kb_retriever:
    tools.append(create_retriever_tool(
        kb_retriever,
        "environmental_knowledge_base",
        "Use this tool to search for official information, environment laws, global warming facts, and details about Irrawaddy dolphins. Translate the concept into Burmese."
    ))

# =====================================================================
# 6. LangChain Tools များ
# =====================================================================
@tool
def get_user_stats(user_id: str) -> str:
    """Check the user's current points, level, and CO2 saved in EcoBin Pyay app."""
    user = USERS_DB.get(user_id)
    if user:
        return f"User '{user['name']}' has {user['points']} points, is at Level {user['level']}, and saved {user['total_co2_saved']} kg of CO2."
    return "User account not found."

@tool
def get_app_rewards_info() -> str:
    """Get information about app rewards in EcoBin Pyay."""
    return "1. KBZPay Cash (1000 Pts = 1000 MMK). 2. Mate Swe Oway Ride (500 Pts = 500 MMK Off). 3. Shwe Min Tha Mee Shopping Voucher (2000 Pts = 2000 MMK Off)."

tools.extend([get_user_stats, get_app_rewards_info])

# =====================================================================
# 7. AI Agent (Eco-Coach)
# =====================================================================
llm = ChatOpenAI(model="openai/gpt-4o-mini", temperature=0.4)

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

# =====================================================================
# 8. API Routes
# =====================================================================
class SyncRequest(BaseModel):
    user_id: str
    current_points: int
    level: int
    total_co2: float

class ChatRequest(BaseModel):
    user_id: str
    message: str

@app.post("/api/sync")
async def sync_user_state(request: SyncRequest):
    USERS_DB[request.user_id] = {
        "name": request.user_id, "points": request.current_points,
        "level": request.level, "total_co2_saved": request.total_co2
    }
    return {"status": "success"}

@app.post("/api/chat")
async def chat_with_eco_coach(request: ChatRequest):
    try:
        response = agent_executor.invoke({"input": f"[User ID: {request.user_id}] \nUser Message: {request.message}"})
        return {"reply": response["output"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail="AI အလုပ်များနေပါသည်။")

# 📸 ပြင်ဆင်ထားသော Roboflow Scan Endpoint (Classification Model အတွက်)
@app.post("/api/scan")
async def scan_waste(file: UploadFile = File(...)):
    if not vision_model:
        raise HTTPException(status_code=500, detail="Roboflow AI နှင့် ချိတ်ဆက်ထားခြင်း မရှိပါ။")

    # ယာယီ File နာမည်တစ်ခုဖန်တီး၍ ပုံကိုသိမ်းခြင်း
    temp_filename = f"temp_{uuid.uuid4()}.jpg"
    with open(temp_filename, "wb") as buffer:
        buffer.write(await file.read())

    try:
        prediction = vision_model.predict(temp_filename).json()
        
        print("==== AI Prediction Result ====")
        print(prediction)
        print("==============================")

        # ယာယီပုံကို ပြန်ဖျက်ခြင်း
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

        # 💡 JSON ထဲမှ class အမည်ကို အမှန်ကန်ဆုံး ဆွဲထုတ်ခြင်း
        class_name = "unknown"
        preds = prediction.get('predictions', [])
        if preds and len(preds) > 0:
            # Log ထဲမှာပါတဲ့ 'top' ကို တိုက်ရိုက်ယူသုံးခြင်း
            if 'top' in preds[0]:
                class_name = preds[0]['top'].lower()
            elif 'predictions' in preds[0] and len(preds[0]['predictions']) > 0:
                class_name = preds[0]['predictions'][0]['class'].lower()

        if class_name == "unknown":
            return {"status": "failed", "message": "အမှိုက်အမျိုးအစားကို သေချာစွာ မဖတ်နိုင်ပါ။"}

        detected_label = "Unknown"
        points = 0
        co2_saved = 0.0

        # အမှိုက်အမျိုးအစားအလိုက် Point သတ်မှတ်ခြင်း
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
        print("Scan Error:", e)
        raise HTTPException(status_code=500, detail="Scan ဖတ်ရာတွင် အခက်အခဲရှိနေပါသည်။")

# =====================================================================
# 9. Server Run ခြင်း
# =====================================================================
import asyncio

print("🚀 Starting EcoBin API Server on http://0.0.0.0:8000")
config = uvicorn.Config(app, host="0.0.0.0", port=8000)
server = uvicorn.Server(config)
await server.serve()