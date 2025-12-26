"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    IconUpload,
    IconDownload,
    IconPhoto,
    IconSparkles,
    IconLoader2,
    IconX,
} from "@tabler/icons-react";

type Style = "anime" | "cartoon";
type Step = "auth" | "upload" | "generating" | "result";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function PhotoTransformer() {
    const [step, setStep] = useState<Step>("auth");
    const [pin, setPin] = useState("");
    const [pinError, setPinError] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [style, setStyle] = useState<Style>("anime");
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Verify PIN
    const handleAuth = async () => {
        try {
            const res = await fetch(`${API_URL}/auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin }),
            });
            if (res.ok) {
                setStep("upload");
                setPinError("");
            } else {
                setPinError("Wrong PIN");
            }
        } catch {
            setPinError("Cannot connect to server");
        }
    };

    // Handle file selection
    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                setSelectedFile(file);
                setPreview(URL.createObjectURL(file));
                setError(null);
            }
        },
        []
    );

    // Handle drop
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) {
            setSelectedFile(file);
            setPreview(URL.createObjectURL(file));
            setError(null);
        }
    }, []);

    // Generate cartoon
    const handleGenerate = async () => {
        if (!selectedFile) return;

        setIsLoading(true);
        setStep("generating");
        setError(null);

        try {
            const formData = new FormData();
            formData.append("image", selectedFile);
            formData.append("style", style);

            const res = await fetch(`${API_URL}/generate`, {
                method: "POST",
                headers: { "X-Family-Pin": pin },
                body: formData,
            });

            if (!res.ok) {
                throw new Error("Generation failed");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setResultUrl(url);
            setStep("result");
        } catch (err) {
            setError("Failed to generate. Please try again.");
            setStep("upload");
        } finally {
            setIsLoading(false);
        }
    };

    // Download result
    const handleDownload = () => {
        if (!resultUrl) return;
        const a = document.createElement("a");
        a.href = resultUrl;
        a.download = `cartoon-${Date.now()}.png`;
        a.click();
    };

    // Reset
    const handleReset = () => {
        setSelectedFile(null);
        setPreview(null);
        setResultUrl(null);
        setStep("upload");
        setError(null);
    };

    // === AUTH SCREEN ===
    if (step === "auth") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-sm">
                    <CardContent className="pt-6">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                                <IconSparkles className="w-8 h-8 text-primary" />
                            </div>
                            <h1 className="text-xl font-semibold">Family Photos</h1>
                            <p className="text-muted-foreground text-sm mt-1">
                                Enter PIN to continue
                            </p>
                        </div>
                        <div className="space-y-4">
                            <Input
                                type="password"
                                placeholder="Enter PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                                className="text-center text-2xl tracking-widest"
                                maxLength={6}
                            />
                            {pinError && (
                                <p className="text-destructive text-sm text-center">
                                    {pinError}
                                </p>
                            )}
                            <Button onClick={handleAuth} className="w-full" size="lg">
                                Continue
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // === GENERATING SCREEN ===
    if (step === "generating") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="text-center">
                    <IconLoader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                    <h2 className="text-lg font-medium">Creating your {style}...</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        This may take 20-40 seconds
                    </p>
                </div>
            </div>
        );
    }

    // === RESULT SCREEN ===
    if (step === "result" && resultUrl) {
        return (
            <div className="min-h-screen bg-background p-4">
                <div className="max-w-lg mx-auto pt-8">
                    <Card>
                        <CardContent className="p-0">
                            <img
                                src={resultUrl}
                                alt="Result"
                                className="w-full rounded-t-lg"
                            />
                        </CardContent>
                    </Card>
                    <div className="flex gap-3 mt-4">
                        <Button onClick={handleDownload} className="flex-1" size="lg">
                            <IconDownload className="w-4 h-4 mr-2" />
                            Save
                        </Button>
                        <Button
                            onClick={handleReset}
                            variant="outline"
                            className="flex-1"
                            size="lg"
                        >
                            New Photo
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // === UPLOAD SCREEN ===
    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-lg mx-auto pt-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold tracking-tight">Photo to Cartoon</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Transform your photos into art
                    </p>
                </div>

                {/* Upload Zone */}
                <Card className="mb-6">
                    <CardContent className="p-0">
                        {preview ? (
                            <div className="relative">
                                <img
                                    src={preview}
                                    alt="Preview"
                                    className="w-full rounded-lg"
                                />
                                <button
                                    onClick={() => {
                                        setSelectedFile(null);
                                        setPreview(null);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                                >
                                    <IconX className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <label
                                className="flex flex-col items-center justify-center h-64 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg border-2 border-dashed border-muted"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                            >
                                <IconPhoto className="w-12 h-12 text-muted-foreground mb-3" />
                                <span className="text-sm font-medium">
                                    Tap to select a photo
                                </span>
                                <span className="text-xs text-muted-foreground mt-1">
                                    or drag and drop
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </CardContent>
                </Card>

                {/* Style Selector */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                        onClick={() => setStyle("anime")}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${style === "anime"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                            }`}
                    >
                        <span className="text-2xl mb-1 block">🎨</span>
                        <span className="font-medium text-sm">Anime</span>
                        <span className="text-xs text-muted-foreground block">
                            Japanese style
                        </span>
                    </button>
                    <button
                        onClick={() => setStyle("cartoon")}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${style === "cartoon"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                            }`}
                    >
                        <span className="text-2xl mb-1 block">✨</span>
                        <span className="font-medium text-sm">Cartoon</span>
                        <span className="text-xs text-muted-foreground block">
                            Pixar style
                        </span>
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <p className="text-destructive text-sm text-center mb-4">{error}</p>
                )}

                {/* Generate Button */}
                <Button
                    onClick={handleGenerate}
                    disabled={!selectedFile || isLoading}
                    className="w-full"
                    size="lg"
                >
                    <IconSparkles className="w-4 h-4 mr-2" />
                    Transform
                </Button>
            </div>
        </div>
    );
}
