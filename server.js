import express from "express";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());
app.use(express.static("public")); // serve o front, então não precisa de CORS

// ===== Banco =====
const db = new Database("box-this-lap.db");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS temporadas (
    ano       INTEGER PRIMARY KEY,
    piloto    TEXT NOT NULL,
    equipe    TEXT NOT NULL,
    pontos    TEXT NOT NULL,
    vitorias  TEXT NOT NULL,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS corridas (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ano     INTEGER NOT NULL REFERENCES temporadas(ano) ON DELETE CASCADE,
    rodada  INTEGER NOT NULL,
    nome_gp TEXT NOT NULL,
    cidade  TEXT,
    pais    TEXT,
    data    TEXT
  );
`);

// ===== Rotas =====

// READ: lista as temporadas favoritas
app.get("/api/favoritos", (req, res) => {
    const lista = db.prepare("SELECT * FROM temporadas ORDER BY criado_em DESC").all();
    res.json(lista);
});

// READ: uma temporada com o calendário
app.get("/api/favoritos/:ano", (req, res) => {
    const temporada = db.prepare("SELECT * FROM temporadas WHERE ano = ?").get(req.params.ano);
    if (!temporada) return res.status(404).json({ erro: "Temporada não encontrada" });

    const corridas = db
        .prepare("SELECT rodada, nome_gp, cidade, pais, data FROM corridas WHERE ano = ? ORDER BY rodada")
        .all(req.params.ano);

    res.json({ ...temporada, corridas });
});

// CREATE: salva campeão + corridas numa transação
app.post("/api/favoritos", (req, res) => {
    const { ano, piloto, equipe, pontos, vitorias, corridas } = req.body;

    if (!ano || !piloto || !equipe || !Array.isArray(corridas)) {
        return res.status(400).json({ erro: "Dados incompletos" });
    }

    const existe = db.prepare("SELECT 1 FROM temporadas WHERE ano = ?").get(ano);
    if (existe) return res.status(409).json({ erro: "Essa temporada já está nos favoritos" });

    const inserirTemporada = db.prepare(
        "INSERT INTO temporadas (ano, piloto, equipe, pontos, vitorias) VALUES (?, ?, ?, ?, ?)"
    );
    const inserirCorrida = db.prepare(
        "INSERT INTO corridas (ano, rodada, nome_gp, cidade, pais, data) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const salvar = db.transaction(() => {
        inserirTemporada.run(ano, piloto, equipe, String(pontos), String(vitorias));
        for (const c of corridas) {
            inserirCorrida.run(ano, c.rodada, c.nome_gp, c.cidade, c.pais, c.data);
        }
    });

    try {
        salvar();
        res.status(201).json({ ok: true });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao salvar no banco" });
    }
});

// DELETE: remove a temporada (as corridas saem por cascata)
app.delete("/api/favoritos/:ano", (req, res) => {
    const resultado = db.prepare("DELETE FROM temporadas WHERE ano = ?").run(req.params.ano);
    if (resultado.changes === 0) return res.status(404).json({ erro: "Não encontrada" });
    res.json({ ok: true });
});

app.listen(3000, () => console.log("Rodando em http://localhost:3000"));