import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3001;
const FAMILY_PIN = process.env.FAMILY_PIN || "1234";
const HF_TOKEN = process.env.HF_TOKEN || "";

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({
    dest: path.join(__dirname, "../temp"),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Style prompts for image editing
const STYLE_PROMPTS: Record<string, string> = {
    anime: "Transform this photo into anime style artwork, detailed anime face, vibrant colors, studio ghibli aesthetic, masterpiece quality",
    cartoon: "Transform this photo into 3D Pixar style cartoon, Disney style character, colorful, smooth shading, expressive face, professional 3d render",
};

// Auth endpoint
app.post("/auth", (req, res) => {
    const { pin } = req.body;
    if (pin === FAMILY_PIN) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid PIN" });
    }
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", backend: "huggingface", model: "Qwen/Qwen-Image-Edit" });
});

// Generate endpoint using Qwen-Image-Edit
app.post("/generate", upload.single("image"), async (req, res) => {
    const pin = req.headers["x-family-pin"];
    if (pin !== FAMILY_PIN) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
    }

    const style = (req.body.style as string) || "anime";
    const prompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.anime;

    try {
        // Read the uploaded file and convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString("base64");

        // Use Qwen-Image-Edit model via HuggingFace
        const response = await fetch(
            "https://router.huggingface.co/hf-inference/models/Qwen/Qwen2.5-VL-72B-Instruct",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inputs: {
                        image: base64Image,
                        text: prompt,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("HuggingFace error:", errorText);

            if (response.status === 503) {
                return res.status(503).json({
                    error: "Model is loading. Please try again in 30 seconds."
                });
            }

            // Try fallback to FLUX for text-to-image
            console.log("Trying fallback to FLUX model...");
            const fallbackResponse = await fetch(
                "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${HF_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        inputs: prompt + ", portrait, high quality",
                    }),
                }
            );

            if (!fallbackResponse.ok) {
                const fallbackError = await fallbackResponse.text();
                console.error("Fallback error:", fallbackError);
                throw new Error(`Generation failed: ${fallbackError}`);
            }

            fs.unlinkSync(req.file.path);
            const fallbackImage = await fallbackResponse.arrayBuffer();
            res.set("Content-Type", "image/png");
            return res.send(Buffer.from(fallbackImage));
        }

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        // Return the generated image
        const imageBlob = await response.arrayBuffer();
        res.set("Content-Type", "image/png");
        res.send(Buffer.from(imageBlob));
    } catch (error) {
        console.error("Generation error:", error);

        // Clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: "Generation failed. Please try again.",
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Orchestrator running on http://localhost:${PORT}`);
    console.log(`🤗 Using HuggingFace API (Qwen-Image-Edit + FLUX fallback)`);
    console.log(`🔐 Family PIN: ${FAMILY_PIN.substring(0, 2)}***`);
    console.log(`🔑 HF Token: ${HF_TOKEN ? "configured" : "MISSING!"}`);
});
