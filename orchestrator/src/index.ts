import express from "express";
import multer from "multer";
import cors from "cors";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import WebSocket from "ws";

const app = express();

// === CONFIG (from environment) ===
const PORT = parseInt(process.env.PORT || "3001");
const FAMILY_PIN = process.env.FAMILY_PIN || "1234";
const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const TEMP_DIR = path.join(process.cwd(), "temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({
    dest: TEMP_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only images allowed"));
        }
    },
});

// PIN authentication middleware
const authMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) => {
    const pin = req.headers["x-family-pin"] as string;
    if (pin !== FAMILY_PIN) {
        res.status(401).json({ error: "Invalid PIN" });
        return;
    }
    next();
};

// === PROMPT TEMPLATES ===
const PROMPTS = {
    anime: {
        positive:
            "masterpiece, best quality, anime style, vibrant colors, detailed eyes, beautiful lighting, sharp focus",
        negative:
            "lowres, bad anatomy, bad hands, text, error, missing fingers, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, blurry, realistic, photo",
    },
    cartoon: {
        positive:
            "cartoon style, pixar style, 3d render, vibrant colors, smooth shading, professional lighting, high quality",
        negative:
            "lowres, bad anatomy, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, blurry, realistic, anime",
    },
} as const;

type Style = keyof typeof PROMPTS;

// === COMFYUI WORKFLOW ===
function createWorkflow(inputImagePath: string, style: Style): object {
    const prompts = PROMPTS[style] || PROMPTS.anime;

    return {
        "1": {
            class_type: "LoadImage",
            inputs: { image: inputImagePath },
        },
        "2": {
            class_type: "CheckpointLoaderSimple",
            inputs: { ckpt_name: "toonyou_beta6.safetensors" },
        },
        "3": {
            class_type: "VAEEncode",
            inputs: { pixels: ["1", 0], vae: ["2", 2] },
        },
        "4": {
            class_type: "CLIPTextEncode",
            inputs: { text: prompts.positive, clip: ["2", 1] },
        },
        "5": {
            class_type: "CLIPTextEncode",
            inputs: { text: prompts.negative, clip: ["2", 1] },
        },
        "6": {
            class_type: "KSampler",
            inputs: {
                seed: Math.floor(Math.random() * 1000000000),
                steps: 20,
                cfg: 7,
                sampler_name: "euler_ancestral",
                scheduler: "normal",
                denoise: 0.6,
                model: ["2", 0],
                positive: ["4", 0],
                negative: ["5", 0],
                latent_image: ["3", 0],
            },
        },
        "7": {
            class_type: "VAEDecode",
            inputs: { samples: ["6", 0], vae: ["2", 2] },
        },
        "8": {
            class_type: "SaveImage",
            inputs: { filename_prefix: "output", images: ["7", 0] },
        },
    };
}

// === COMFYUI API ===
async function queueWorkflow(workflow: object): Promise<string> {
    const clientId = uuid();

    const response = await fetch(`${COMFYUI_URL}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!response.ok) {
        throw new Error(`ComfyUI error: ${response.statusText}`);
    }

    const data = (await response.json()) as { prompt_id: string };
    return data.prompt_id;
}

async function waitForCompletion(promptId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:8188/ws`);
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("Timeout waiting for ComfyUI"));
        }, 120000); // 2 minute timeout

        ws.on("message", async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === "executed" && message.data.prompt_id === promptId) {
                    clearTimeout(timeout);
                    ws.close();

                    // Get the output image
                    const historyRes = await fetch(`${COMFYUI_URL}/history/${promptId}`);
                    const history = (await historyRes.json()) as Record<string, any>;
                    const outputs = history[promptId]?.outputs;

                    if (outputs?.["8"]?.images?.[0]) {
                        const img = outputs["8"].images[0];
                        resolve(
                            `${COMFYUI_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ""}&type=${img.type}`
                        );
                    } else {
                        reject(new Error("No output image"));
                    }
                }
            } catch {
                // Ignore parse errors
            }
        });

        ws.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Helper: cleanup temp file
function cleanupFile(filePath: string) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // Ignore cleanup errors
    }
}

// === ROUTES ===

// Health check
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Photo Transformer API" });
});

// Verify PIN
app.post("/auth", (req, res) => {
    const { pin } = req.body;
    if (pin === FAMILY_PIN) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid PIN" });
    }
});

// Generate cartoon
app.post("/generate", authMiddleware, upload.single("image"), async (req, res) => {
    const file = req.file;
    const style = (req.body.style as Style) || "anime";

    if (!file) {
        res.status(400).json({ error: "No image uploaded" });
        return;
    }

    // Rename file with extension for ComfyUI compatibility
    const ext = path.extname(file.originalname) || ".jpg";
    const newPath = file.path + ext;
    fs.renameSync(file.path, newPath);

    try {
        // Create and queue workflow
        const workflow = createWorkflow(newPath, style);
        const promptId = await queueWorkflow(workflow);

        // Wait for completion
        const imageUrl = await waitForCompletion(promptId);

        // Fetch the image from ComfyUI
        const imageRes = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

        // Send image with no-cache headers
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.send(imageBuffer);
    } catch (error) {
        console.error("Generation error:", (error as Error).message);
        res.status(500).json({ error: "Generation failed" });
    } finally {
        // Always cleanup temp file
        cleanupFile(newPath);
    }
});

// === START SERVER ===
app.listen(PORT, () => {
    console.log(`🎨 Photo Transformer API running on http://localhost:${PORT}`);
    console.log(`🔗 ComfyUI: ${COMFYUI_URL}`);
    // Don't log PIN for security
});
