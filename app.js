import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    query, where, deleteDoc, doc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// SUAS CHAVES (MANTENHA AS SUAS!)
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

// Elementos
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

// Novos Elementos
const inputPorcentagem = document.getElementById('inputPorcentagem');
const checkRepetir = document.getElementById('checkRepetir');
const boxRepeticao = document.getElementById('boxRepeticao');
const modoRepeticao = document.getElementById('modoRepeticao');
const qtdeMesesInput = document.getElementById('qtdeMeses');

// Modal
const modalEditar = document.getElementById('modal-editar');
const btnCancelarEdit = document.getElementById('btnCancelarEdit');
const btnSalvarEdit = document.getElementById('btnSalvarEdit');
const editDesc = document.getElementById('edit-desc');
const editValor = document.getElementById('edit-valor');
const editCategoria = document.getElementById('edit-categoria');
const editTipo = document.getElementById('edit-tipo');

// Variáveis
let chartRosca = null;
let chartBarras = null;
let unsubscribe = null;
let usuarioAtual = null;
let idEmEdicao = null;

filtroMes.value = new Date().toISOString().slice(0, 7);
let porcentagemReserva = localStorage.getItem('user_reserva_pct') || 20;
inputPorcentagem.value = porcentagemReserva;

// ======================================================
// INTERAÇÕES
// ======================================================
checkRepetir.addEventListener('change', (e) => {
    boxRepeticao.style.display = e.target.checked ? 'grid' : 'none';
});

inputPorcentagem.addEventListener('change', (e) => {
    let valor = parseInt(e.target.value);
    if(valor < 0) valor = 0; if(valor > 100) valor = 100;
    porcentagemReserva = valor;
    localStorage.setItem('user_reserva_pct', valor);
    carregarDados(); 
});

// ======================================================
// LOGIN
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
// FUNÇÕES PRINCIPAIS
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
                uid: usuarioAtual.uid, descricao: descFinal, valor: valorFinal, tipo: tipo,
                categoria: categoria, referencia: `${anoFuturo}-${mesFuturo}`, criadoEm: Date.now() + i
            }));
        }

        await Promise.all(promessas);
        
        document.getElementById('desc').value = "";
        document.getElementById('valor').value = "";
        checkRepetir.checked = false;
        boxRepeticao.style.display = 'none';
        alert("Salvo com sucesso!");

    } catch (e) { console.error(e); alert("Erro ao salvar."); } 
    finally { btnAdicionar.disabled = false; btnAdicionar.innerText = "Salvar Lançamento"; }
}

function carregarDados() {
    if (unsubscribe) unsubscribe();
    if (!usuarioAtual) return;

    const q = query(collection(db, "financas"), where("uid", "==", usuarioAtual.uid), where("referencia", "==", filtroMes.value));

    unsubscribe = onSnapshot(q, (snapshot) => {
        tabelaEl.innerHTML = "";
        let totalEntrada = 0, totalSaida = 0;
        const gastosPorCategoria = {};
        let listaDocs = [];

        snapshot.forEach(doc => listaDocs.push({ id: doc.id, ...doc.data() }));
        listaDocs.sort((a, b) => b.criadoEm - a.criadoEm);

        if (listaDocs.length === 0) {
            tabelaEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Sem dados.</td></tr>';
            atualizarDashboard(0, 0, {}); return;
        }

        listaDocs.forEach((dados) => {
            const valor = dados.valor || 0;
            if (dados.tipo === 'entrada') totalEntrada += valor;
            else {
                totalSaida += valor;
                if (dados.categoria !== 'Salário') gastosPorCategoria[dados.categoria] = (gastosPorCategoria[dados.categoria] || 0) + valor;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="tag-categoria">${dados.categoria}</span></td>
                <td>${dados.descricao}</td>
                <td class="${dados.tipo === 'entrada' ? 'entrada' : 'saida'}">
                    ${dados.tipo === 'entrada' ? '+' : '-'} R$ ${valor.toFixed(2)}
                </td>
                <td style="white-space:nowrap">
                    <button class="btn-acao" onclick="abrirModalEdicao('${dados.id}', '${dados.descricao}', ${valor}, '${dados.categoria}', '${dados.tipo}')"><span class="material-icons-round">edit</span></button>
                    <button class="btn-acao" onclick="deletarItem('${dados.id}')"><span class="material-icons-round">delete</span></button>
                </td>
            `;
            tabelaEl.appendChild(tr);
        });

        atualizarDashboard(totalEntrada, totalSaida, gastosPorCategoria);
    });
}

// Localize a função atualizarDashboard e substitua por esta versão:

function atualizarDashboard(entrada, saida, categorias) {
    // 1. Elementos (Se preferir, declare lá no topo, mas funciona aqui também)
    const dicaEl = document.getElementById('dicaRestante');

    const saldo = entrada - saida;
    saldoEl.innerText = `R$ ${saldo.toFixed(2)}`;
    
    // 2. Calcula a Reserva
    const pct = porcentagemReserva / 100;
    const reservaMeta = saldo > 0 ? saldo * pct : 0;
    reservaEl.innerText = `R$ ${reservaMeta.toFixed(2)}`;
    
    // 3. NOVO: Calcula o Saldo "Livre" (Pós-Investimento)
    const saldoLivre = saldo - reservaMeta;

    if (saldo > 0) {
        // Mostra quanto sobra se a pessoa investir
        dicaEl.innerHTML = `Sobrará <strong>R$ ${saldoLivre.toFixed(2)}</strong> livre.`;
        dicaEl.style.color = 'var(--text-muted)'; // Cor normal
    } else {
        // Se estiver negativo ou zerado, esconde ou mostra aviso
        dicaEl.innerHTML = "Sem saldo para investir.";
        dicaEl.style.color = 'var(--danger)'; // Cor vermelha sutil
    }
    
    // 4. Lógica de Status (Mantida)
    let htmlStatus = '';
    if (entrada === 0) {
        htmlStatus = '<span style="color: var(--text-muted)">Aguardando renda...</span>';
    } else {
        const taxaPoupanca = (saldo / entrada) * 100;

        if (saldo < 0) {
            htmlStatus = `<span style="color: var(--danger); font-weight:bold">Endividado (${taxaPoupanca.toFixed(1)}%)</span>`;
        } else if (taxaPoupanca < 5) {
            htmlStatus = `<span style="color: #f87171">No Limite (${taxaPoupanca.toFixed(1)}%)</span>`;
        } else if (taxaPoupanca < 15) {
            htmlStatus = `<span style="color: #facc15">Atenção (${taxaPoupanca.toFixed(1)}%)</span>`;
        } else if (taxaPoupanca < 30) {
            htmlStatus = `<span style="color: #34d399">Saudável (${taxaPoupanca.toFixed(1)}%)</span>`;
        } else {
            htmlStatus = `<span style="color: #14b8a6; font-weight:bold">Investidor (${taxaPoupanca.toFixed(1)}%)</span>`;
        }
    }

    statusEl.innerHTML = htmlStatus;
    atualizarGraficos(entrada, saida, categorias);
}

// Funções Globais e Gráficos
window.deletarItem = async function(id) { if(confirm("Apagar?")) await deleteDoc(doc(db, "financas", id)); }
window.abrirModalEdicao = function(id, desc, valor, categoria, tipo) {
    idEmEdicao = id; editDesc.value = desc; editValor.value = valor; editCategoria.value = categoria; editTipo.value = tipo; modalEditar.style.display = 'flex';
}
btnCancelarEdit.addEventListener('click', () => { modalEditar.style.display = 'none'; idEmEdicao = null; });
btnSalvarEdit.addEventListener('click', async () => {
    if(!idEmEdicao) return;
    try {
        await updateDoc(doc(db, "financas", idEmEdicao), { descricao: editDesc.value, valor: parseFloat(editValor.value), categoria: editCategoria.value, tipo: editTipo.value });
        modalEditar.style.display = 'none';
    } catch(e) { console.error(e); } finally { idEmEdicao = null; }
});

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

btnAdicionar.addEventListener('click', adicionar);
filtroMes.addEventListener('change', carregarDados);