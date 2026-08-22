import "dotenv/config";
import express from "express";
import { healthRouter } from "./routes/health.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use("/health", healthRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
