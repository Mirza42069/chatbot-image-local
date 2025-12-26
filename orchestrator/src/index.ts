import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3001;
const FAMILY_PIN = process.env.FAMILY_PIN || "1234";
const A1111_URL = process.env.A1111_URL || "http://127.0.0.1:7860";

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({
    dest: path.join(__dirname, "../temp"),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Style prompts for different transformations
const STYLE_PROMPTS: Record<string, { positive: string; negative: string }> = {
    anime: {
        positive:
            "anime style, high quality anime artwork, studio ghibli style, detailed anime face, vibrant colors, beautiful lighting, masterpiece, best quality, detailed eyes, smooth skin",
        negative:
            "photo, realistic, 3d render, ugly, deformed, blurry, low quality, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, username, watermark, signature",
    },
    cartoon: {
        positive:
            "pixar style, 3d cartoon, disney style, high quality 3d render, colorful, smooth shading, expressive face, vibrant colors, professional 3d art, octane render, masterpiece, best quality",
        negative:
            "anime, realistic photo, ugly, deformed, blurry, low quality, bad anatomy, bad proportions, extra limbs, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, username, watermark, signature, 2d, flat",
    },
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
app.get("/health", async (req, res) => {
    try {
        const response = await fetch(`${A1111_URL}/sdapi/v1/sd-models`);
        if (response.ok) {
            res.json({ status: "ok", a1111: "connected" });
        } else {
            res.status(503).json({ status: "error", a1111: "not responding" });
        }
    } catch {
        res.status(503).json({ status: "error", a1111: "not connected" });
    }
});

// Generate endpoint
app.post("/generate", upload.single("image"), async (req, res) => {
    const pin = req.headers["x-family-pin"];
    if (pin !== FAMILY_PIN) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
    }

    const style = (req.body.style as string) || "anime";
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.anime;

    try {
        // Read the uploaded file and convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString("base64");

        // Call A1111 img2img API
        const a1111Response = await fetch(`${A1111_URL}/sdapi/v1/img2img`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                init_images: [base64Image],
                prompt: stylePrompt.positive,
                negative_prompt: stylePrompt.negative,
                steps: 30,
                cfg_scale: 7,
                width: 512,
                height: 512,
                denoising_strength: 0.6,
                sampler_name: "DPM++ 2M Karras",
                batch_size: 1,
                n_iter: 1,
            }),
        });

        if (!a1111Response.ok) {
            const errorText = await a1111Response.text();
            console.error("A1111 error:", errorText);
            throw new Error(`A1111 returned ${a1111Response.status}`);
        }

        const result = (await a1111Response.json()) as { images: string[] };

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        if (!result.images || result.images.length === 0) {
            throw new Error("No image generated");
        }

        // Return the generated image as binary
        const generatedImage = Buffer.from(result.images[0], "base64");
        res.set("Content-Type", "image/png");
        res.send(generatedImage);
    } catch (error) {
        console.error("Generation error:", error);

        // Clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: "Generation failed. Is Automatic1111 running with --api flag?",
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Orchestrator running on http://localhost:${PORT}`);
    console.log(`📡 Connecting to A1111 at ${A1111_URL}`);
    console.log(`🔐 Family PIN: ${FAMILY_PIN.substring(0, 2)}***`);
});
