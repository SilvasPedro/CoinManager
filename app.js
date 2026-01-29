import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    query, where, deleteDoc, doc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// ======================================================
// CONFIGURAÇÃO
// ======================================================
const firebaseConfig = {
    apiKey: "AIzaSyC_4uHxa8NsmExmbZ602r8IsUZg6yvbO7o", 
    authDomain: "coinmanager-7e0bd.firebaseapp.com",
    projectId: "coinmanager-7e0bd",
    storageBucket: "coinmanager-7e0bd.firebasestorage.app",
    messagingSenderId: "812321893222",
    appId: "1:812321893222:web:b75756885a781ca09e36a7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ======================================================
// ELEMENTOS DO DOM
// ======================================================
const loginScreen = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');

const filtroMes = document.getElementById('filtroMes');
const btnAdicionar = document.getElementById('btnAdicionar');
const tabelaEl = document.getElementById('listaTransacoes');
const saldoEl = document.getElementById('displaySaldo');
const reservaEl = document.getElementById('displayReserva');
const statusEl = document.getElementById('statusFinanceiro');

// Novos Elementos (Configuração, Pesquisa e Status)
const inputPorcentagem = document.getElementById('inputPorcentagem');
const checkRepetir = document.getElementById('checkRepetir');
const boxRepeticao = document.getElementById('boxRepeticao');
const modoRepeticao = document.getElementById('modoRepeticao');
const qtdeMesesInput = document.getElementById('qtdeMeses');
const inputBusca = document.getElementById('inputBusca'); 
const displayFalta = document.getElementById('displayFalta'); // <--- NOVO DISPLAY

// Modal
const modalEditar = document.getElementById('modal-editar');
const btnCancelarEdit = document.getElementById('btnCancelarEdit');
const btnSalvarEdit = document.getElementById('btnSalvarEdit');
const editDesc = document.getElementById('edit-desc');
const editValor = document.getElementById('edit-valor');
const editCategoria = document.getElementById('edit-categoria');
const editTipo = document.getElementById('edit-tipo');

// ======================================================
// ESTADO GLOBAL
// ======================================================
let chartRosca = null;
let chartBarras = null;
let unsubscribe = null;
let usuarioAtual = null;
let idEmEdicao = null;
let listaTransacoesGlobal = []; 

filtroMes.value = new Date().toISOString().slice(0, 7);
let porcentagemReserva = localStorage.getItem('user_reserva_pct') || 20;
inputPorcentagem.value = porcentagemReserva;

// ======================================================
// EVENTOS & LISTENERS
// ======================================================
checkRepetir.addEventListener('change', (e) => {
    boxRepeticao.style.display = e.target.checked ? 'grid' : 'none';
});

inputPorcentagem.addEventListener('change', (e) => {
    let valor = parseInt(e.target.value);
    if(valor < 0) valor = 0; if(valor > 100) valor = 100;
    porcentagemReserva = valor;
    localStorage.setItem('user_reserva_pct', valor);
    recalcularDashboardComDadosAtuais();
});

if(inputBusca) {
    inputBusca.addEventListener('input', () => {
        renderizarTabela(); 
    });
}

btnAdicionar.addEventListener('click', adicionar);
filtroMes.addEventListener('change', carregarDados);

// ======================================================
// AUTENTICAÇÃO
// ======================================================
btnLogin.addEventListener('click', () => signInWithPopup(auth, provider));
btnLogout.addEventListener('click', () => signOut(auth).then(() => window.location.reload()));

onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioAtual = user;
        userName.innerText = user.displayName.split(" ")[0];
        userPhoto.src = user.photoURL || "https://via.placeholder.com/40";
        loginScreen.style.display = 'none';
        appContainer.style.display = 'block';
        carregarDados();
    } else {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        usuarioAtual = null;
    }
});

// ======================================================
// FUNÇÕES PRINCIPAIS (CRUD)
// ======================================================
async function adicionar() {
    if (!usuarioAtual) return;
    const desc = document.getElementById('desc').value;
    const valorOriginal = parseFloat(document.getElementById('valor').value);
    const categoria = document.getElementById('categoria').value;
    const tipo = document.getElementById('tipo').value;
    const isRepetir = checkRepetir.checked;
    const modo = modoRepeticao.value;
    const qtdeMeses = parseInt(qtdeMesesInput.value) || 1;
    const mesBase = filtroMes.value; 

    if (!desc || isNaN(valorOriginal)) return alert("Preencha descrição e valor!");

    btnAdicionar.innerText = isRepetir ? "Processando..." : "Salvando...";
    btnAdicionar.disabled = true;

    try {
        let loop = isRepetir ? qtdeMeses : 1;
        let valorFinal = valorOriginal;
        let descFinal = desc;

        if(isRepetir && modo === 'parcelado') valorFinal = valorOriginal / loop;

        const promessas = [];
        let [anoBase, mesNumBase] = mesBase.split('-').map(Number);

        for (let i = 0; i < loop; i++) {
            let dataFutura = new Date(anoBase, (mesNumBase - 1) + i, 1);
            let anoFuturo = dataFutura.getFullYear();
            let mesFuturo = (dataFutura.getMonth() + 1).toString().padStart(2, '0');
            
            if(isRepetir && modo === 'parcelado') descFinal = `${desc} (${i+1}/${loop})`;

            promessas.push(addDoc(collection(db, "financas"), {
                uid: usuarioAtual.uid, 
                descricao: descFinal, 
                valor: valorFinal, 
                tipo: tipo,
                categoria: categoria, 
                referencia: `${anoFuturo}-${mesFuturo}`, 
                pago: false, // <--- NOVO CAMPO: Padrão é não pago
                criadoEm: Date.now() + i
            }));
        }

        await Promise.all(promessas);
        
        document.getElementById('desc').value = "";
        document.getElementById('valor').value = "";
        checkRepetir.checked = false;
        boxRepeticao.style.display = 'none';

    } catch (e) { console.error(e); alert("Erro ao salvar."); } 
    finally { btnAdicionar.disabled = false; btnAdicionar.innerText = "Salvar Lançamento"; }
}

function carregarDados() {
    if (unsubscribe) unsubscribe();
    if (!usuarioAtual) return;

    const q = query(collection(db, "financas"), where("uid", "==", usuarioAtual.uid), where("referencia", "==", filtroMes.value));

    unsubscribe = onSnapshot(q, (snapshot) => {
        listaTransacoesGlobal = [];
        let totalEntrada = 0, totalSaida = 0;
        let totalFaltaPagar = 0; // <--- Variável para acumular o que falta
        const gastosPorCategoria = {};

        snapshot.forEach(doc => {
            const dados = { id: doc.id, ...doc.data() };
            // Garante que o campo 'pago' exista (para registros antigos)
            if(dados.pago === undefined) dados.pago = false; 
            
            listaTransacoesGlobal.push(dados);

            const valor = dados.valor || 0;
            if (dados.tipo === 'entrada') {
                totalEntrada += valor;
            } else {
                totalSaida += valor;
                // Se é saída e NÃO está pago, soma no 'Falta Pagar'
                if (!dados.pago) totalFaltaPagar += valor;

                if (dados.categoria !== 'Salário') {
                    gastosPorCategoria[dados.categoria] = (gastosPorCategoria[dados.categoria] || 0) + valor;
                }
            }
        });

        listaTransacoesGlobal.sort((a, b) => b.criadoEm - a.criadoEm);

        atualizarDashboard(totalEntrada, totalSaida, gastosPorCategoria, totalFaltaPagar);
        renderizarTabela(); 
    });
}

// ======================================================
// CORREÇÃO NA FUNÇÃO DE RENDERIZAR TABELA
// ======================================================
function renderizarTabela() {
    tabelaEl.innerHTML = "";
    
    const termo = inputBusca ? inputBusca.value.toLowerCase() : "";
    
    const listaFiltrada = listaTransacoesGlobal.filter(item => 
        item.descricao.toLowerCase().includes(termo) || 
        item.categoria.toLowerCase().includes(termo)
    );

    if (listaFiltrada.length === 0) {
        tabelaEl.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">Nenhum lançamento encontrado.</td></tr>';
        return;
    }

    listaFiltrada.forEach((dados) => {
        const tr = document.createElement('tr');
        const valorFormatado = dados.valor.toFixed(2);
        
        // --- INÍCIO DA MUDANÇA DO CHECKBOX ---
        let checkIconHTML = '';

        if (dados.tipo === 'entrada') {
            // Entradas: Mostra sempre o "check" verde fixo (não clicável), pois já é dinheiro em conta.
            checkIconHTML = `<span class="material-icons-round" style="font-size:22px; color:var(--success); opacity: 0.7; cursor: default;" title="Entrada confirmada">check_circle</span>`;
        } else {
            // Saídas: Lógica de alternar ícones
            if (dados.pago) {
                // ESTADO 1: PAGO (Ícone check_circle verde)
                // Ao clicar, enviamos 'false' para desmarcar
                checkIconHTML = `
                    <span class="material-icons-round" 
                          style="font-size:22px; color:var(--success); cursor: pointer; transition: transform 0.1s" 
                          onclick="togglePago('${dados.id}', false)"
                          onmousedown="this.style.transform='scale(0.9)'" 
                          onmouseup="this.style.transform='scale(1)'"
                          title="Clique para marcar como pendente">
                        check_circle
                    </span>`;
            } else {
                // ESTADO 2: PENDENTE (Ícone radio_button_unchecked cinza - círculo vazio)
                // Ao clicar, enviamos 'true' para marcar como pago
                checkIconHTML = `
                    <span class="material-icons-round" 
                          style="font-size:22px; color:var(--text-muted); cursor: pointer; transition: transform 0.1s" 
                          onclick="togglePago('${dados.id}', true)"
                          onmousedown="this.style.transform='scale(0.9)'" 
                          onmouseup="this.style.transform='scale(1)'"
                          title="Clique para marcar como pago">
                        radio_button_unchecked
                    </span>`;
            }
        }
        // --- FIM DA MUDANÇA DO CHECKBOX ---

        // Estilo visual para riscar o texto se pago e for saída
        const estiloTexto = dados.pago && dados.tipo === 'saida' ? 'text-decoration: line-through; opacity: 0.5;' : '';

        tr.innerHTML = `
            <td style="text-align: center; vertical-align: middle;">${checkIconHTML}</td>
            <td style="vertical-align: middle;"><span class="tag-categoria">${dados.categoria}</span></td>
            <td style="${estiloTexto}; vertical-align: middle;">${dados.descricao}</td>
            <td class="${dados.tipo === 'entrada' ? 'entrada' : 'saida'}" style="${estiloTexto}; vertical-align: middle;">
                ${dados.tipo === 'entrada' ? '+' : '-'} R$ ${valorFormatado}
            </td>
            <td style="white-space:nowrap; vertical-align: middle;">
                <button class="btn-acao" onclick="abrirModalEdicao('${dados.id}', '${dados.descricao}', ${dados.valor}, '${dados.categoria}', '${dados.tipo}')"><span class="material-icons-round">edit</span></button>
                <button class="btn-acao" onclick="deletarItem('${dados.id}')"><span class="material-icons-round">delete</span></button>
            </td>
        `;
        tabelaEl.appendChild(tr);
    });
}

function recalcularDashboardComDadosAtuais() {
    let entrada = 0, saida = 0, falta = 0;
    listaTransacoesGlobal.forEach(d => {
        if(d.tipo === 'entrada') entrada += d.valor;
        else {
            saida += d.valor;
            if(!d.pago) falta += d.valor;
        }
    });
    atualizarDashboard(entrada, saida, {}, falta); 
}

// Recebe o novo parâmetro 'faltaPagar'
function atualizarDashboard(entrada, saida, categorias, faltaPagar) {
    const dicaEl = document.getElementById('dicaRestante');
    
    if(Object.keys(categorias).length > 0 || (entrada === 0 && saida === 0)) {
        atualizarGraficos(entrada, saida, categorias);
    }

    const saldo = entrada - saida;
    saldoEl.innerText = `R$ ${saldo.toFixed(2)}`;
    
    const pct = porcentagemReserva / 100;
    const reservaMeta = saldo > 0 ? saldo * pct : 0;
    reservaEl.innerText = `R$ ${reservaMeta.toFixed(2)}`;

    // ATUALIZA O CARD "A PAGAR"
    if(displayFalta) {
        displayFalta.innerText = `R$ ${faltaPagar.toFixed(2)}`;
        // Se falta pagar for 0 e houver saídas, fica verde (parabéns!)
        if(faltaPagar === 0 && saida > 0) displayFalta.style.color = 'var(--success)';
        else displayFalta.style.color = 'var(--danger)';
    }
    
    const saldoLivre = saldo - reservaMeta;

    if (saldo > 0) {
        dicaEl.innerHTML = `Sobrará <strong>R$ ${saldoLivre.toFixed(2)}</strong> livre.`;
        dicaEl.style.color = 'var(--text-muted)';
    } else {
        dicaEl.innerHTML = "Sem saldo para investir.";
        dicaEl.style.color = 'var(--danger)';
    }
    
    let htmlStatus = '';
    if (entrada === 0) {
        htmlStatus = '<span style="color: var(--text-muted)">Aguardando renda...</span>';
    } else {
        const taxaPoupanca = (saldo / entrada) * 100;
        if (saldo < 0) htmlStatus = `<span style="color: var(--danger); font-weight:bold">Endividado (${taxaPoupanca.toFixed(1)}%)</span>`;
        else if (taxaPoupanca < 5) htmlStatus = `<span style="color: #f87171">No Limite (${taxaPoupanca.toFixed(1)}%)</span>`;
        else if (taxaPoupanca < 15) htmlStatus = `<span style="color: #facc15">Atenção (${taxaPoupanca.toFixed(1)}%)</span>`;
        else if (taxaPoupanca < 30) htmlStatus = `<span style="color: #34d399">Saudável (${taxaPoupanca.toFixed(1)}%)</span>`;
        else htmlStatus = `<span style="color: #14b8a6; font-weight:bold">Investidor (${taxaPoupanca.toFixed(1)}%)</span>`;
    }
    statusEl.innerHTML = htmlStatus;
}

function atualizarGraficos(entrada, saida, categorias) {
    const ctxRosca = document.getElementById('graficoRosca').getContext('2d');
    if (chartRosca) chartRosca.destroy();
    
    chartRosca = new Chart(ctxRosca, {
        type: 'doughnut',
        data: { labels: ['Renda', 'Despesas'], datasets: [{ data: [entrada, saida], backgroundColor: ['#34d399', '#f87171'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{color:'#94a3b8'} } }, cutout: '70%' }
    });

    const ctxBarras = document.getElementById('graficoBarras').getContext('2d');
    if (chartBarras) chartBarras.destroy();
    
    chartBarras = new Chart(ctxBarras, {
        type: 'bar',
        data: { labels: Object.keys(categorias), datasets: [{ data: Object.values(categorias), backgroundColor: ['#14b8a6', '#0ea5e9', '#6366f1', '#d946ef', '#f43f5e'], borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks:{color:'#94a3b8'}, grid:{color:'rgba(255,255,255,0.05)'} }, y: { ticks:{color:'#f1f5f9'}, grid:{display:false} } } }
    });
}

// ======================================================
// FUNÇÕES GLOBAIS (MODAIS E AÇÕES)
// ======================================================
window.deletarItem = async function(id) { if(confirm("Apagar?")) await deleteDoc(doc(db, "financas", id)); }

// NOVA FUNÇÃO GLOBAL: TOGGLE PAGO
window.togglePago = async function(id, novoStatus) {
    try {
        // Atualiza no Firebase, o listener onSnapshot vai detetar e atualizar a tela automaticamente
        await updateDoc(doc(db, "financas", id), { pago: novoStatus });
    } catch(e) {
        console.error("Erro ao atualizar status:", e);
        alert("Erro ao marcar como pago.");
    }
}

window.abrirModalEdicao = function(id, desc, valor, categoria, tipo) {
    idEmEdicao = id; 
    editDesc.value = desc; 
    editValor.value = valor; 
    editCategoria.value = categoria; 
    editTipo.value = tipo; 
    modalEditar.style.display = 'flex';
}

btnCancelarEdit.addEventListener('click', () => { modalEditar.style.display = 'none'; idEmEdicao = null; });
btnSalvarEdit.addEventListener('click', async () => {
    if(!idEmEdicao) return;
    try {
        await updateDoc(doc(db, "financas", idEmEdicao), { 
            descricao: editDesc.value, 
            valor: parseFloat(editValor.value), 
            categoria: editCategoria.value, 
            tipo: editTipo.value 
        });
        modalEditar.style.display = 'none';
    } catch(e) { console.error(e); } finally { idEmEdicao = null; }
});