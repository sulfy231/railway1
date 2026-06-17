import { Hono } from "hono";
import { MongoClient, ObjectId } from "mongodb";

const app = new Hono();

// MongoDB connection
const mongoUrl = Bun.env.MONGO_URL;
const client = new MongoClient(mongoUrl);
let db;

// Initialize MongoDB connection
try {
  await client.connect();
  db = client.db("todos_db");
  const collection = db.collection("todos");
  
  // Create index for better performance
  await collection.createIndex({ created_at: -1 });
} catch (error) {
  console.error("MongoDB connection error:", error);
}

// OpenRouter API configuration
const OPENROUTER_API_KEY = Bun.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Helper function to call Claude via OpenRouter
async function callClaude(messages) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3.5-sonnet",
      messages: messages,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// GET all todos
app.get("/todos", async (c) => {
  try {
    const collection = db.collection("todos");
    const todos = await collection
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    return c.json(todos);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// GET single todo
app.get("/todos/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!ObjectId.isValid(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }
    const collection = db.collection("todos");
    const todo = await collection.findOne({ _id: new ObjectId(id) });
    if (!todo) {
      return c.json({ error: "Todo not found" }, 404);
    }
    return c.json(todo);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// POST create todo
app.post("/todos", async (c) => {
  try {
    const { title } = await c.req.json();
    if (!title) {
      return c.json({ error: "Title is required" }, 400);
    }
    const collection = db.collection("todos");
    const result = await collection.insertOne({
      title,
      completed: false,
      created_at: new Date(),
    });
    const newTodo = await collection.findOne({ _id: result.insertedId });
    return c.json(newTodo, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// POST create todo with AI (natural language)
app.post("/todos/ai/create", async (c) => {
  try {
    const { description } = await c.req.json();
    if (!description) {
      return c.json({ error: "Description is required" }, 400);
    }

    // Use Claude to extract and improve the todo title
    const aiResponse = await callClaude([
      {
        role: "user",
        content: `Extract a concise todo title from this description. Return ONLY the title, nothing else:\n\n${description}`,
      },
    ]);

    const title = aiResponse.trim();
    const collection = db.collection("todos");
    const result = await collection.insertOne({
      title,
      description,
      completed: false,
      created_at: new Date(),
      ai_generated: true,
    });
    const newTodo = await collection.findOne({ _id: result.insertedId });
    return c.json(newTodo, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// POST get AI suggestions for todos
app.post("/todos/ai/suggest", async (c) => {
  try {
    const collection = db.collection("todos");
    const todos = await collection.find({}).toArray();

    if (todos.length === 0) {
      return c.json({ suggestions: "No todos yet. Create some todos first!" });
    }

    const todoList = todos
      .map((t) => `- ${t.title}${t.completed ? " (completed)" : ""}`)
      .join("\n");

    const aiResponse = await callClaude([
      {
        role: "user",
        content: `Based on these todos, provide 2-3 helpful suggestions to improve productivity:\n\n${todoList}`,
      },
    ]);

    return c.json({ suggestions: aiResponse });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// POST analyze todos with AI
app.post("/todos/ai/analyze", async (c) => {
  try {
    const collection = db.collection("todos");
    const todos = await collection.find({}).toArray();

    if (todos.length === 0) {
      return c.json({ analysis: "No todos to analyze." });
    }

    const completed = todos.filter((t) => t.completed).length;
    const pending = todos.length - completed;
    const todoList = todos
      .map((t) => `- ${t.title}${t.completed ? " (completed)" : ""}`)
      .join("\n");

    const aiResponse = await callClaude([
      {
        role: "user",
        content: `Analyze this todo list and provide insights:\n\nCompleted: ${completed}/${todos.length}\nPending: ${pending}\n\nTodos:\n${todoList}\n\nProvide a brief analysis and recommendations.`,
      },
    ]);

    return c.json({
      stats: { total: todos.length, completed, pending },
      analysis: aiResponse,
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// PATCH update todo
app.patch("/todos/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!ObjectId.isValid(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }
    const { title, completed } = await c.req.json();

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (completed !== undefined) updates.completed = completed;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const collection = db.collection("todos");
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return c.json({ error: "Todo not found" }, 404);
    }
    return c.json(result.value);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// DELETE todo
app.delete("/todos/:id", async (c) => {
  try {
    const id = c.req.param("id");
    if (!ObjectId.isValid(id)) {
      return c.json({ error: "Invalid todo ID" }, 400);
    }
    const collection = db.collection("todos");
    const result = await collection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return c.json({ error: "Todo not found" }, 404);
    }
    return c.json({ message: "Todo deleted" });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default app;