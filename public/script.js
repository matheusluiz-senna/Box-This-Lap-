// ===== Configuração =====
const BASE_URL = "https://api.jolpi.ca/ergast/f1"; // API de F1 (Jolpica)
const API_BACKEND = "/api";                         // Backend próprio (Express + SQLite)
const PRIMEIRO_ANO = 1950;

// ===== Elementos da página =====
const input = document.getElementById("inputAno");
const botao = document.getElementById("btnBuscar");
const resultado = document.getElementById("resultado");
const listaFavoritos = document.getElementById("listaFavoritos");

// Guarda os dados da temporada que está na tela (usado ao favoritar)
let temporadaAtual = null;

botao.addEventListener("click", () => buscarTemporada());

input.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    buscarTemporada();
  }
});

// ===== Etapa 01: consulta à API de F1 =====
async function buscarTemporada() {
  const ano = input.value.trim();
  const anoAtual = new Date().getFullYear();

  if (ano === "" || Number(ano) < PRIMEIRO_ANO || Number(ano) > anoAtual) {
    resultado.innerHTML = `<p class="erro">Digite um ano válido, entre ${PRIMEIRO_ANO} e ${anoAtual}.</p>`;
    return;
  }

  resultado.innerHTML = `<p class="dica">Carregando dados da temporada ${ano}...</p>`;

  try {
    const [respostaStandings, respostaRaces] = await Promise.all([
      fetch(`${BASE_URL}/${ano}/driverstandings/?format=json`),
      fetch(`${BASE_URL}/${ano}/races/?format=json`)
    ]);

    if (!respostaStandings.ok || !respostaRaces.ok) {
      throw new Error("Erro ao consultar a API");
    }

    const dadosStandings = await respostaStandings.json();
    const dadosRaces = await respostaRaces.json();

    const listasClassificacao = dadosStandings.MRData.StandingsTable.StandingsLists;
    const corridas = dadosRaces.MRData.RaceTable.Races;

    if (listasClassificacao.length === 0 || corridas.length === 0) {
      throw new Error("Sem dados para essa temporada");
    }

    const campeao = listasClassificacao[0].DriverStandings[0];

    // Dados no formato que o backend espera receber ao favoritar
    temporadaAtual = {
      ano: Number(ano),
      piloto: `${campeao.Driver.givenName} ${campeao.Driver.familyName}`,
      equipe: campeao.Constructors[0].name,
      pontos: campeao.points,
      vitorias: campeao.wins,
      corridas: corridas.map(corrida => ({
        rodada: Number(corrida.round),
        nome_gp: corrida.raceName,
        cidade: corrida.Circuit.Location.locality,
        pais: corrida.Circuit.Location.country,
        data: corrida.date
      }))
    };

    mostrarResultado(ano, campeao, corridas);

  } catch (erro) {
    temporadaAtual = null;
    resultado.innerHTML = `
      <p class="erro">Não encontramos dados para a temporada ${ano} 😕</p>
      <p class="dica">Tente outro ano (a partir de 1950) ou verifique se essa temporada já terminou.</p>
    `;
  }
}

function mostrarResultado(ano, campeao, corridas) {
  const nomeCompleto = `${campeao.Driver.givenName} ${campeao.Driver.familyName}`;
  const equipe = campeao.Constructors[0].name;

  const corridasHtml = corridas.map(corrida => {
    const dataFormatada = formatarData(corrida.date);
    return `
      <div class="corrida">
        <div class="linha-corrida">
          <span class="rodada">${corrida.round}</span>
          <div class="info-corrida">
            <span class="nome-gp">${corrida.raceName}</span>
            <span class="local">${corrida.Circuit.Location.locality}, ${corrida.Circuit.Location.country}</span>
          </div>
        </div>
        <span class="data">${dataFormatada}</span>
      </div>
    `;
  }).join("");

  resultado.innerHTML = `
    <div class="campeao">
      <h2>Campeão da temporada ${ano}</h2>
      <div class="nome">${nomeCompleto}</div>
      <div class="detalhes">
        <span>🏁 ${equipe}</span>
        <span>⭐ ${campeao.points} pts</span>
        <span>🏆 ${campeao.wins} vitórias</span>
      </div>
      <button id="btnFavoritar" class="btn-favoritar">⭐ Favoritar temporada</button>
    </div>
    <p id="avisoFavorito" class="aviso"></p>

    <div class="calendario">
      <h3>Calendário (${corridas.length} corridas)</h3>
      ${corridasHtml}
    </div>
  `;

  document.getElementById("btnFavoritar").addEventListener("click", favoritarTemporada);
}

function formatarData(dataISO) {
  const data = new Date(dataISO + "T00:00:00");
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ===== Etapa 02: persistência com backend próprio (SQLite) =====

function mostrarAviso(texto) {
  const aviso = document.getElementById("avisoFavorito");
  if (aviso) aviso.textContent = texto;
}

// CREATE: envia a temporada atual (campeão + corridas) para o backend salvar
async function favoritarTemporada() {
  if (!temporadaAtual) return;

  const botaoFav = document.getElementById("btnFavoritar");
  botaoFav.disabled = true;

  try {
    const resposta = await fetch(`${API_BACKEND}/favoritos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(temporadaAtual)
    });

    // 409 = a temporada já existe no banco
    if (resposta.status === 409) {
      mostrarAviso("Essa temporada já está nos seus favoritos.");
      return;
    }
    if (!resposta.ok) throw new Error("Falha ao salvar");

    mostrarAviso("Temporada salva nos favoritos! ⭐");
    await listarFavoritos();

  } catch (erro) {
    console.error("Erro ao salvar favorito:", erro);
    mostrarAviso("Não foi possível salvar agora. Tente novamente.");
  } finally {
    botaoFav.disabled = false;
  }
}

// READ: lista os favoritos salvos no banco
async function listarFavoritos() {
  try {
    const resposta = await fetch(`${API_BACKEND}/favoritos`);
    if (!resposta.ok) throw new Error("Falha ao listar");

    const favoritos = await resposta.json();
    renderizarFavoritos(favoritos);
  } catch (erro) {
    console.error("Erro ao listar favoritos:", erro);
    listaFavoritos.innerHTML = `<p class="erro">Não foi possível carregar seus favoritos agora.</p>`;
  }
}

// DELETE: remove um favorito pelo ano (as corridas saem junto, por cascata)
async function removerFavorito(ano) {
  try {
    const resposta = await fetch(`${API_BACKEND}/favoritos/${ano}`, { method: "DELETE" });
    if (!resposta.ok) throw new Error("Falha ao remover");

    await listarFavoritos();
  } catch (erro) {
    console.error("Erro ao remover favorito:", erro);
    listaFavoritos.innerHTML = `<p class="erro">Não foi possível remover agora. Tente novamente.</p>`;
  }
}

// Monta a lista na tela (usa textContent para não injetar HTML vindo do banco)
function renderizarFavoritos(favoritos) {
  listaFavoritos.innerHTML = "";

  if (favoritos.length === 0) {
    listaFavoritos.innerHTML = `<p class="dica">Nenhum favorito ainda. Busque uma temporada e clique em "Favoritar".</p>`;
    return;
  }

  favoritos.forEach(item => {
    const linha = document.createElement("div");
    linha.className = "favorito";

    const nome = document.createElement("span");
    nome.className = "favorito-nome";
    nome.textContent = `${item.ano} · ${item.piloto}`;

    const acoes = document.createElement("div");
    acoes.className = "favorito-acoes";

    const btnVer = document.createElement("button");
    btnVer.className = "btn-mini";
    btnVer.textContent = "Ver";
    btnVer.addEventListener("click", () => {
      input.value = item.ano;
      buscarTemporada();
    });

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn-mini btn-excluir";
    btnExcluir.textContent = "Excluir";
    btnExcluir.addEventListener("click", () => removerFavorito(item.ano));

    acoes.append(btnVer, btnExcluir);
    linha.append(nome, acoes);
    listaFavoritos.appendChild(linha);
  });
}

// Ao abrir a página, carrega os favoritos já salvos
listarFavoritos();