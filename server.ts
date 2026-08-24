import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // AI Packing Advisor endpoint using Gemini API
  app.post('/api/ai-consultant', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({
          advice: "【AIアドバイザー注意】GEMINI_API_KEYが設定されていません。一般的な最適化ルールに従って荷積みを実行してください：重い荷物を下部に配置し、重心をコンテナ中心から前後5%以内に収めることで、海上輸送および陸上輸送時の安全性を大幅に向上させることができます。",
          recommendations: [
            "重い荷物を底面中央部に集中させ、転倒防止を図る",
            "隙間にはエアバッグ（ダンネージ）を配置し荷崩れを防止",
            "開口部付近には取り出し優先度の高い荷物を配置"
          ]
        });
      }

      const { container, items, stats, language } = req.body;

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
You are a senior maritime logistics and 3D container load planning engineer.
Analyze the following 3D container packing configuration and provide expert operational recommendations for warehouse loaders, freight forwarders, and logistics managers.

Container details:
- Name: ${container?.name || 'Container'}
- Internal Dimensions: L ${container?.length}mm x W ${container?.width}mm x H ${container?.height}mm
- Max Payload: ${container?.maxWeight}kg
- Total Packed Volume: ${stats?.packedVolumeCbm?.toFixed(2)} m³ (${stats?.volumeUtilization?.toFixed(1)}% utilization)
- Total Cargo Weight: ${stats?.packedWeightKg?.toFixed(1)} kg (${stats?.weightUtilization?.toFixed(1)}% utilization)
- Packed Items Count: ${stats?.packedCount} of ${stats?.totalCount} items
- Center of Gravity Offset: X: ${stats?.cogOffsetX?.toFixed(1)}%, Y: ${stats?.cogOffsetY?.toFixed(1)}%, Z: ${stats?.cogOffsetZ?.toFixed(1)}%

Items summary:
${JSON.stringify(items?.slice(0, 15), null, 2)}

Provide a structured, practical, and highly professional logistics audit report in ${language === 'ja' ? 'Japanese (日本語)' : 'English'}.
Include:
1. Overall Packing Safety & Efficiency Score (e.g. 92/100) and brief rationale.
2. Center of Gravity & Transit Stability Assessment (Sea / Road / Rail risk).
3. Lashing, Dunnage & Cushioning recommendations for empty voids.
4. Unloading & Multi-drop advice (if applicable).
5. 3 specific actionable tips to improve space or weight utilization.

Respond in structured JSON format with fields:
{
  "score": number (0-100),
  "scoreTitle": string,
  "summary": string,
  "stabilityAnalysis": string,
  "dunnageAdvice": string,
  "actionableTips": string[]
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);
      return res.json(parsed);
    } catch (err: any) {
      console.error('AI Packing advisor error:', err);
      return res.status(500).json({
        error: 'Failed to generate AI advice',
        details: err?.message || String(err)
      });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`3D Container Packing Optimizer running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
