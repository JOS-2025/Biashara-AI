import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type TransactionType = 'sale' | 'expense';

export interface ParsedTransaction {
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  productName?: string;
  quantity?: number;
}

export async function parseTransactionMessage(message: string): Promise<ParsedTransaction | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Parse the following message into a structured transaction. 
      
      Examples:
      - "Sold 5 bags of cement for 4500" -> {"type": "sale", "amount": 4500, "category": "sales", "description": "Sold 5 bags of cement", "productName": "cement", "quantity": 5}
      - "Bought fuel for the delivery truck 2000" -> {"type": "expense", "amount": 2000, "category": "transport", "description": "Fuel for delivery truck"}
      - "Paid rent for March 15000" -> {"type": "expense", "amount": 15000, "category": "rent", "description": "March rent"}
      - "Confirmed. KES 1,200.00 received from JANE DOE 0712345678 on 18/3/26 at 1:12 PM." -> {"type": "sale", "amount": 1200, "category": "sales", "description": "M-Pesa payment from JANE DOE"}
      - "Bought 10 crates of soda for 6000" -> {"type": "expense", "amount": 6000, "category": "stock", "description": "10 crates of soda", "productName": "soda", "quantity": 10}
      - "Received 5000 from a friend as a gift" -> {"type": "sale", "amount": 5000, "category": "other income", "description": "Gift received"}
      
      Message: "${message}"`,
      config: {
        systemInstruction: `You are a financial assistant for small businesses in Africa. 
        Your task is to parse user messages into a structured JSON object representing a transaction.
        
        Rules:
        1. Categories MUST be one of: sales, other income, stock, rent, transport, salary, utilities, marketing, other.
        2. If the message indicates money coming in (sales, gifts, interest), type is 'sale'.
        3. If the message indicates money going out (buying stock, paying bills, transport), type is 'expense'.
        4. For M-Pesa receipts, extract the amount and treat it as a 'sale' in the 'sales' category.
        5. The description should be concise but informative.
        6. If a product name and quantity are mentioned (e.g., "5 bags of cement", "10 crates of soda"), extract them into 'productName' and 'quantity'.
        7. If the message is ambiguous, make the best guess based on common business practices.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              description: "Must be either 'sale' or 'expense'",
              enum: ["sale", "expense"]
            },
            amount: {
              type: Type.NUMBER,
              description: "The monetary amount of the transaction"
            },
            category: {
              type: Type.STRING,
              description: "The category of the transaction (e.g., sales, other income, stock, rent, transport, salary, utilities, marketing, other)"
            },
            description: {
              type: Type.STRING,
              description: "A short, clean description of the transaction"
            },
            productName: {
              type: Type.STRING,
              description: "The name of the product mentioned, if any"
            },
            quantity: {
              type: Type.NUMBER,
              description: "The quantity of the product mentioned, if any"
            }
          },
          required: ["type", "amount", "category", "description"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    
    return JSON.parse(text) as ParsedTransaction;
  } catch (error) {
    console.error("Error parsing transaction:", error);
    return null;
  }
}
