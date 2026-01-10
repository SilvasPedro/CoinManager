// ======================================================
// 1. IMPORTAÇÕES (Auth + Firestore + App)
// ======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    query, where, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// ======================================================
// 2. CONFIGURAÇÃO DO FIREBASE
// (Mantenha as SUAS chaves aqui!)
// ======================================================
const firebaseConfig = {
    apiKey: "AIzaSyC_4uHxa8NsmExmbZ602r8IsUZg6yvbO7o", 
    authDomain: "coinmanager-7e0bd.firebaseapp.com",
    projectId: "coinmanager-7e0bd",
    storageBucket: "coinmanager-7e0bd.firebasestorage.app",
    messagingSenderId: "812321893222",
    appId: "1:812321893222:web:b75756885a781ca09e36a7"
};

// Inicializa Serviços
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ======================================================
// 3. ELEMENTOS DO DOM (HTML)
// ======================================================
// Telas
const loginScreen = document.getElementById('login-overlay');
const appContainer = document.getElementById('app-container');

// Botões de Auth
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');

// Perfil
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');

// Funcionais
const filtroMes = document.getElementById('filtroMes');
const btnAdicionar = document.getElementById('btnAdicionar');
const tabelaEl = document.getElementById('listaTransacoes');

// Dashboard Cards
const saldoEl = document.getElementById('displaySaldo');
const reservaEl = document.getElementById('displayReserva');
const statusEl = document.getElementById('statusFinanceiro'); // Elemento do Status

// Variáveis Globais de Controle
let chartRosca = null;
let chartBarras = null;
let unsubscribe = null; // Para desligar o listener do banco
let usuarioAtual = null; // Guarda o usuário logado

// Define Mês Atual no Input
filtroMes.value = new Date().toISOString().slice(0, 7);


// ======================================================
// 4. SISTEMA DE AUTENTICAÇÃO (LOGIN/LOGOUT)
// ======================================================

// Login com Google
btnLogin.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then(() => {
            // Sucesso: O onAuthStateChanged vai assumir daqui
        })
        .catch((error) => {
            console.error("Erro no login:", error);
            alert("Erro ao conectar com Google. Verifique se o domínio está autorizado no Firebase.");
        });
});

// Logout
btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.reload(); // Recarrega para limpar tudo
    });
});

// Monitor de Estado (O "Porteiro")
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuário Entrou
        usuarioAtual = user;
        
        // Atualiza UI do Topo
        userName.innerText = user.displayName.split(" ")[0]; // Só o primeiro nome
        userPhoto.src = user.photoURL || "https://via.placeholder.com/40";
        
        // Troca as telas
        loginScreen.style.display = 'none';
        appContainer.style.display = 'block';

        // Carrega os dados deste usuário
        carregarDados();

    } else {
        // Usuário Saiu
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        usuarioAtual = null;
    }
});


// ======================================================
// 5. FUNÇÕES PRINCIPAIS (CRUD)
// ======================================================

// --- ADICIONAR TRANSAÇÃO ---
async function adicionar() {
    if (!usuarioAtual) return; // Segurança

    const desc = document.getElementById('desc').value;
    const valorInput = document.getElementById('valor').value;
    const categoria = document.getElementById('categoria').value;
    const tipo = document.getElementById('tipo').value;
    const mesReferencia = filtroMes.value;

    if (!desc || valorInput === "") return alert("Preencha descrição e valor!");

    const valor = parseFloat(valorInput);

    // Feedback visual
    btnAdicionar.disabled = true;
    btnAdicionar.innerText = "Salvando...";

    try {
        await addDoc(collection(db, "financas"), {
            uid: usuarioAtual.uid, // VINCULA AO USUÁRIO
            descricao: desc,
            valor: valor,
            tipo: tipo,
            categoria: categoria,
            referencia: mesReferencia,
            criadoEm: Date.now()
        });

        // Limpa campos
        document.getElementById('desc').value = "";
        document.getElementById('valor').value = "";
        document.getElementById('desc').focus();

    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar lançamento.");
    } finally {
        btnAdicionar.disabled = false;
        btnAdicionar.innerText = "Salvar Lançamento";
    }
}

// --- CARREGAR DADOS (LEITURA EM TEMPO REAL) ---
function carregarDados() {
    // Se já tinha um listener, desliga para não duplicar
    if (unsubscribe) unsubscribe();
    if (!usuarioAtual) return;

    const mesSelecionado = filtroMes.value;

    // QUERY: Filtra por Usuário E Mês
    const q = query(
        collection(db, "financas"),
        where("uid", "==", usuarioAtual.uid),
        where("referencia", "==", mesSelecionado)
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        tabelaEl.innerHTML = "";
        
        let totalEntrada = 0;
        let totalSaida = 0;
        const gastosPorCategoria = {};

        // Converter para array para ordenar manualmente
        let listaDocs = [];
        snapshot.forEach(doc => listaDocs.push({ id: doc.id, ...doc.data() }));
        
        // Ordena por data de criação (mais recente primeiro)
        listaDocs.sort((a, b) => b.criadoEm - a.criadoEm);

        if (listaDocs.length === 0) {
            tabelaEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Nenhum lançamento neste mês.</td></tr>';
            
            // Zera tudo visualmente
            saldoEl.innerText = "R$ 0,00";
            reservaEl.innerText = "R$ 0,00";
            statusEl.innerText = "Aguardando dados...";
            atualizarGraficos(0, 0, {});
            return;
        }

        // Loop principal
        listaDocs.forEach((dados) => {
            const valor = dados.valor || 0;

            if (dados.tipo === 'entrada') {
                totalEntrada += valor;
            } else {
                totalSaida += valor;
                // Agrupa categorias (exceto Salário, que não é gasto)
                if (dados.categoria !== 'Salário') {
                    gastosPorCategoria[dados.categoria] = (gastosPorCategoria[dados.categoria] || 0) + valor;
                }
            }

            // Cria linha na tabela
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="tag-categoria">${dados.categoria}</span></td>
                <td>${dados.descricao}</td>
                <td class="${dados.tipo === 'entrada' ? 'entrada' : 'saida'}">
                    ${dados.tipo === 'entrada' ? '+' : '-'} R$ ${valor.toFixed(2)}
                </td>
                <td>
                    <button class="btn-acao btn-deletar" onclick="deletarItem('${dados.id}')">
                        <span class="material-icons-round">delete</span>
                    </button>
                </td>
            `;
            tabelaEl.appendChild(tr);
        });

        // 1. Atualiza Saldo
        const saldo = totalEntrada - totalSaida;
        saldoEl.innerText = `R$ ${saldo.toFixed(2)}`;

        // 2. Atualiza Reserva (20% se positivo)
        const reserva = saldo > 0 ? saldo * 0.20 : 0;
        reservaEl.innerText = `R$ ${reserva.toFixed(2)}`;

        // 3. Atualiza Status Financeiro (NOVO!)
        atualizarStatusFinanceiro(totalEntrada, totalSaida);

        // 4. Atualiza Gráficos
        atualizarGraficos(totalEntrada, totalSaida, gastosPorCategoria);
    });
}

// --- DELETAR ITEM ---
// Precisa ser global (window) para o HTML acessar via onclick
window.deletarItem = async function(id) {
    if (confirm("Tem certeza que deseja apagar este item?")) {
        try {
            await deleteDoc(doc(db, "financas", id));
        } catch (e) {
            console.error("Erro ao deletar:", e);
        }
    }
}


// ======================================================
// 6. LÓGICA DE INTELIGÊNCIA (GRÁFICOS E STATUS)
// ======================================================

// --- ATUALIZA STATUS (O "MÉDICO") ---
function atualizarStatusFinanceiro(entrada, saida) {
    // Caso 0: Sem renda ainda
    if (entrada === 0) {
        statusEl.innerHTML = `<span style="color: var(--text-muted)">Adicione uma renda para começar.</span>`;
        return;
    }

    const saldo = entrada - saida;
    const percentualGasto = (saida / entrada) * 100;

    // Caso 1: Vermelho (Negativo)
    if (saldo < 0) {
        statusEl.innerHTML = `
            <span style="color: var(--color-danger); font-weight: bold; display: flex; align-items: center; gap: 6px;">
                <span class="material-icons-round">trending_down</span>
                Crítico: Gastos maiores que a renda!
            </span>`;
        return;
    }

    // Caso 2: Amarelo (Alerta > 90%)
    if (percentualGasto >= 90) {
        statusEl.innerHTML = `
            <span style="color: #facc15; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                <span class="material-icons-round">warning</span>
                Atenção: Orçamento no limite.
            </span>`;
        return;
    }

    // Caso 3: Verde (Saudável)
    statusEl.innerHTML = `
        <span style="color: var(--color-success); font-weight: bold; display: flex; align-items: center; gap: 6px;">
            <span class="material-icons-round">verified</span>
            Saúde Financeira Excelente!
        </span>`;
}

// --- ATUALIZA GRÁFICOS (CHART.JS) ---
function atualizarGraficos(entrada, saida, categorias) {
    // 1. Gráfico Rosca (Entrada vs Saída)
    const ctxRosca = document.getElementById('graficoRosca').getContext('2d');
    if (chartRosca) chartRosca.destroy();

    chartRosca = new Chart(ctxRosca, {
        type: 'doughnut',
        data: {
            labels: ['Renda', 'Despesas'],
            datasets: [{
                data: [entrada, saida],
                backgroundColor: ['#34d399', '#f87171'], // Cores do tema
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8' } }
            },
            layout: { padding: 10 },
            cutout: '70%' // Rosca mais fina
        }
    });

    // 2. Gráfico Barras (Categorias)
    const ctxBarras = document.getElementById('graficoBarras').getContext('2d');
    if (chartBarras) chartBarras.destroy();

    const labels = Object.keys(categorias);
    const valores = Object.values(categorias);
    const cores = ['#0d9488', '#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];

    chartBarras = new Chart(ctxBarras, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gastos',
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', // Barras horizontais
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    ticks: { color: '#94a3b8', callback: (val) => 'R$ ' + val },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: { 
                    ticks: { color: '#f1f5f9' },
                    grid: { display: false }
                }
            }
        }
    });
}

// ======================================================
// 7. INICIALIZAÇÃO DE EVENTOS
// ======================================================
btnAdicionar.addEventListener('click', adicionar);
filtroMes.addEventListener('change', carregarDados);