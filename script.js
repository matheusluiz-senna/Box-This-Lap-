const input = document.getElementById("inputAno");
const botao = document.getElementById("btnBuscar");
const resultado = document.getElementById("resultado");

const BASE_URL = "https://api.jolpi.ca/ergast/f1";
const PRIMEIRO_ANO = 1950;

botao.addEventListener("click", () => buscarTemporada());

input.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    buscarTemporada();
  }
});

async function buscarTemporada() {
  const ano = input.value.trim();
  const anoAtual = new Date().getFullYear();

  if (ano === "" || Number(ano) < PRIMEIRO_ANO || Number(ano) > anoAtual) {
    resultado.innerHTML = `<p class="erro">Digite um ano válido, entre ${PRIMEIRO_ANO} e ${anoAtual}.</p>`;
    return;
  }

  resultado.innerHTML = `<p class="dica">Carregando dados da temporada ${ano}...</p>`;

  try {
    // Busca a classificação final de pilotos e o calendário de corridas em paralelo
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

    const classificacao = listasClassificacao[0].DriverStandings;
    const campeao = classificacao[0];

    mostrarResultado(ano, campeao, corridas);

  } catch (erro) {
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
    </div>

    <div class="calendario">
      <h3>Calendário (${corridas.length} corridas)</h3>
      ${corridasHtml}
    </div>
  `;
}

function formatarData(dataISO) {
  const data = new Date(dataISO + "T00:00:00");
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
