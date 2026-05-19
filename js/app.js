import { auth, provider } from '../js/firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { FinanceService } from '../js/finance-service.js';

// ==========================================
// ELEMENTOS GLOBAIS DA UI
// ==========================================
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const monthSelector = document.getElementById('month-selector');
const toastContainer = document.getElementById('toast-container');

const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view-section');

const formModal = document.getElementById('form-modal');
const form = document.getElementById('transaction-form');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const formTitle = document.getElementById('form-title');
const editIdInput = document.getElementById('edit-id');
const btnSubmit = document.getElementById('btn-submit');

// Elementos de Parcelamento
const chkInstallment = document.getElementById('is-installment');
const installmentFields = document.getElementById('installment-fields');
const installmentContainer = document.getElementById('installment-container');

const confirmModal = document.getElementById('confirm-modal');
const btnCancelConfirm = document.getElementById('btn-cancel-confirm');
const btnDoConfirm = document.getElementById('btn-do-confirm');

const transactionList = document.getElementById('transaction-list');

let doughnutChart = null;
let evolutionChart = null;
let categoryChart = null;

let currentUser = null;
let currentTransactions = [];
let unsubscribeData = null;
let pendingConfirmAction = null;

// ==========================================
// UTILITÁRIOS
// ==========================================
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDateBR = (dateStr) => dateStr ? dateStr.split('-').reverse().join('/') : '-';

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-petroleo';
    toast.className = `${bgClass} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto animate-slide-in z-[80]`;
    toast.innerHTML = `<span class="text-sm font-medium">${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// ==========================================
// CONTROLE DE MODAIS
// ==========================================
const openFormModal = (isEdit = false) => {
    formModal.classList.remove('hidden');
    formTitle.textContent = isEdit ? 'Editar Lançamento' : 'Novo Lançamento';
    btnSubmit.textContent = isEdit ? 'Atualizar' : 'Salvar';

    if (isEdit) {
        installmentContainer.classList.add('hidden');
        chkInstallment.checked = false;
        installmentFields.classList.add('hidden');
    } else {
        installmentContainer.classList.remove('hidden');
    }
};

const closeFormModal = () => {
    formModal.classList.add('hidden');
    form.reset();
    editIdInput.value = '';
    document.getElementById('date-input').value = new Date().toISOString().split('T')[0];
    chkInstallment.checked = false;
    installmentFields.classList.add('hidden');
};

btnOpenModal.addEventListener('click', () => openFormModal(false));
btnCloseModal.addEventListener('click', closeFormModal);
btnCancelModal.addEventListener('click', closeFormModal);

chkInstallment.addEventListener('change', (e) => {
    if (e.target.checked) {
        installmentFields.classList.remove('hidden');
        installmentFields.classList.add('grid');
    } else {
        installmentFields.classList.add('hidden');
        installmentFields.classList.remove('grid');
    }
});

const customConfirm = (actionCallback) => {
    pendingConfirmAction = actionCallback;
    confirmModal.classList.remove('hidden');
    setTimeout(() => {
        confirmModal.classList.remove('opacity-0');
        confirmModal.querySelector('div').classList.remove('scale-95');
    }, 10);
};

const closeConfirmModal = () => {
    confirmModal.classList.add('opacity-0');
    confirmModal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        confirmModal.classList.add('hidden');
        pendingConfirmAction = null;
    }, 300);
};

btnCancelConfirm.addEventListener('click', closeConfirmModal);
btnDoConfirm.addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirmModal();
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
const hoje = new Date();
const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
monthSelector.value = mesAtual;
document.getElementById('date-input').value = hoje.toISOString().split('T')[0];

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navBtns.forEach(b => {
            b.classList.remove('text-white', 'border-white');
            b.classList.add('text-gray-300', 'border-transparent');
        });
        e.target.classList.remove('text-gray-300', 'border-transparent');
        e.target.classList.add('text-white', 'border-white');
        const targetView = e.target.getAttribute('data-target');
        views.forEach(view => {
            view.classList.toggle('hidden', view.id !== targetView);
        });
    });
});

// ==========================================
// RENDERIZAÇÃO
// ==========================================
const updateFinancialStatus = (totals) => {
    const elMessage = document.getElementById('status-message');
    const elPercentage = document.getElementById('status-percentage');
    const elBarFill = document.getElementById('status-bar-fill');

    if (totals.income === 0) {
        elMessage.textContent = "Sem receitas registradas neste mês.";
        elMessage.className = "text-base md:text-lg font-semibold text-gray-500 mt-1";
        elPercentage.textContent = "0%";
        elBarFill.style.width = "0%";
        elBarFill.className = "h-full rounded-full transition-all duration-1000 w-0 bg-gray-300";
        return;
    }

    let percent = (totals.balance / totals.income) * 100;
    let barWidth = percent < 0 ? 0 : percent > 100 ? 100 : percent;

    let statusText = ""; let colorClass = ""; let barColorClass = "";

    if (percent < 10) {
        statusText = "Crítico: Cuidado com os gastos!";
        colorClass = "text-red-600"; barColorClass = "bg-red-500";
    } else if (percent >= 10 && percent <= 20) {
        statusText = "Atenção: Revise as suas contas.";
        colorClass = "text-orange-500"; barColorClass = "bg-orange-500";
    } else if (percent > 20 && percent <= 30) {
        statusText = "Estável: Finanças sob controle.";
        colorClass = "text-yellow-600"; barColorClass = "bg-yellow-400";
    } else if (percent > 30 && percent <= 50) {
        statusText = "Bom: Ótimo potencial de investimento.";
        colorClass = "text-lime-600"; barColorClass = "bg-lime-500";
    } else {
        statusText = "Excelente: Saúde financeira perfeita!";
        colorClass = "text-green-600"; barColorClass = "bg-green-500";
    }

    elMessage.textContent = statusText; elMessage.className = `text-base md:text-lg font-semibold mt-1 ${colorClass}`;
    elPercentage.textContent = `${percent.toFixed(1)}%`; elPercentage.className = `text-xl md:text-2xl font-bold ${colorClass}`;
    elBarFill.style.width = `${barWidth}%`; elBarFill.className = `h-full rounded-full transition-all duration-1000 ${barColorClass}`;
};

const renderCharts = async (totals) => {
    const ctxDoughnut = document.getElementById('doughnutChart');
    if (ctxDoughnut) {
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctxDoughnut.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Receitas', 'Despesas'], datasets: [{ data: [totals.income, totals.expense], backgroundColor: ['#1B7577', '#EF4444'], borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15 } } } }
        });
    }

    const ctxEvolution = document.getElementById('evolutionChart');
    if (ctxEvolution && currentUser) {
        const currentSelectedMonth = document.getElementById('month-selector').value;
        const evolutionData = await FinanceService.getEvolutionData(currentUser.uid, currentSelectedMonth);

        const labels = evolutionData.map(d => {
            const [year, month] = d.month.split('-');
            return `${month}/${year.slice(-2)}`;
        });
        const balances = evolutionData.map(d => d.balance);
        const bgColors = balances.map(b => b >= 0 ? '#10B981' : '#EF4444');

        if (evolutionChart) evolutionChart.destroy();
        evolutionChart = new Chart(ctxEvolution.getContext('2d'), {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Saldo (R$)', data: balances, backgroundColor: bgColors, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } } }
        });
    }

    const ctxCategory = document.getElementById('categoryChart');
    if (ctxCategory) {
        const expenses = currentTransactions.filter(t => t.tipo === 'saida');

        const categoryData = expenses.reduce((acc, curr) => {
            acc[curr.categoria] = (acc[curr.categoria] || 0) + curr.valor;
            return acc;
        }, {});

        const sortedCategories = Object.entries(categoryData).sort((a, b) => b[1] - a[1]);
        const labels = sortedCategories.map(item => item[0]);
        const data = sortedCategories.map(item => item[1]);

        const colors = ['#EF4444', '#F97316', '#F59E0B', '#8B5CF6', '#EC4899', '#3B82F6', '#14B8A6', '#64748B'];

        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(ctxCategory.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
};

const updateDashboard = async () => {
    const percent = document.getElementById('investment-percent').value;
    const totals = FinanceService.calculateTotals(currentTransactions, percent);

    document.getElementById('total-income').textContent = formatCurrency(totals.income);
    document.getElementById('total-expense').textContent = formatCurrency(totals.expense);
    document.getElementById('total-balance').textContent = formatCurrency(totals.balance);
    document.getElementById('total-investment').textContent = formatCurrency(totals.investment);
    document.getElementById('pending-expense').textContent = formatCurrency(totals.pendingExpense);
    document.getElementById('invest-label').textContent = `${(percent * 100).toFixed(0)}%`;

    updateFinancialStatus(totals);
    await renderCharts(totals);
};

document.getElementById('investment-percent').addEventListener('change', updateDashboard);

const renderList = (transactions) => {
    transactionList.innerHTML = '';

    if (transactions.length === 0) {
        transactionList.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-gray-400 block md:table-cell">Nenhum registro encontrado para este mês.</td></tr>`; return;
    }

    transactions.forEach(t => {
        const isIncome = t.tipo === 'entrada';
        const typeLabel = isIncome
            ? `<span class="bg-green-100/50 text-green-700 border border-green-200 text-xs px-2.5 py-1 rounded-md font-medium">Entrada</span>`
            : `<span class="bg-red-100/50 text-red-700 border border-red-200 text-xs px-2.5 py-1 rounded-md font-medium">Saída</span>`;
        const valueColor = isIncome ? 'text-petroleo' : 'text-red-500';

        const categoryEmojis = {
            "Moradia": "🏠 Moradia", "Alimentação": "🍔 Alimentação", "Transporte": "🚗 Transporte", "Lazer": "🎉 Lazer",
            "Saúde": "💊 Saúde", "Educação": "📚 Educação", "Contas": "💡 Contas", "Salário": "💰 Salário",
            "Investimento": "📈 Investimento", "Assinatura": "🔄 Assinatura", "Outros": "📦 Outros"
        };
        const catText = categoryEmojis[t.categoria] || t.categoria || '📦 Outros';

        const paidBtn = t.tipo === 'saida' ? `
            <button data-id="${t.id}" data-pago="${t.pago}" class="btn-toggle-paid p-2 md:p-1.5 rounded-lg md:rounded transition-all flex items-center justify-center ${t.pago ? 'bg-green-100/50 hover:bg-green-200/50' : 'bg-gray-50 md:bg-transparent border border-gray-100 md:border-none hover:bg-orange-50'}" title="${t.pago ? 'Marcar como Pendente' : 'Marcar como Pago'}">
                ${t.pago
                ? `<svg class="w-6 h-6 md:w-5 md:h-5 pointer-events-none text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                       </svg>`
                : `<svg class="w-6 h-6 md:w-5 md:h-5 pointer-events-none text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                       </svg>`
            }
            </button>
        ` : '';

        const tr = document.createElement('tr');
        tr.className = "flex flex-col md:table-row bg-white rounded-2xl md:rounded-none shadow-sm md:shadow-none border border-gray-100 md:border-none hover:bg-gray-50/50 transition-colors p-5 md:p-0";

        tr.innerHTML = `
            <td class="block md:table-cell md:px-6 md:py-4 text-sm text-gray-500 mb-2 md:mb-0">
                <div class="flex justify-between items-center md:block">
                    <span>${formatDateBR(t.data)}</span>
                    <span class="md:hidden">${typeLabel}</span>
                </div>
            </td>

            <td class="block md:table-cell md:px-6 md:py-4 mb-3 md:mb-0">
                <div class="text-gray-800 font-medium text-base md:text-sm">${t.descricao}</div>
                <div class="text-xs text-gray-500 mt-0.5">${catText}</div>
            </td>

            <td class="hidden md:table-cell md:px-6 md:py-4">
                ${typeLabel}
            </td>

            <td class="block md:table-cell md:px-6 md:py-4 md:text-right">
                <div class="flex justify-between items-center md:block pt-3 md:pt-0 border-t border-gray-100 md:border-none">
                    <span class="font-bold text-lg md:text-base md:font-semibold ${valueColor}">
                        ${isIncome ? '+' : '-'} ${formatCurrency(t.valor)}
                    </span>
                    
                    <div class="flex items-center gap-2 md:hidden">
                        ${paidBtn}
                        <button data-id="${t.id}" class="btn-edit text-blue-500 hover:bg-blue-50 p-2 rounded-lg bg-gray-50 border border-gray-100 transition-all" title="Editar">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button data-id="${t.id}" class="btn-delete text-red-500 hover:bg-red-50 p-2 rounded-lg bg-gray-50 border border-gray-100 transition-all" title="Excluir">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            </td>

            <td class="hidden md:table-cell md:px-6 md:py-4 text-center">
                <div class="flex items-center justify-center gap-3">
                    ${paidBtn}
                    <button data-id="${t.id}" class="btn-edit text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-all" title="Editar">
                        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button data-id="${t.id}" class="btn-delete text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-all" title="Excluir">
                        <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        `;
        transactionList.appendChild(tr);
    });
}

transactionList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('btn-delete')) {
        customConfirm(async () => {
            try {
                await FinanceService.deleteTransaction(btn.dataset.id);
                showToast('Registro excluído com sucesso.', 'success');
                updateDashboard();
            } catch (err) {
                showToast('Erro ao excluir registro.', 'error');
            }
        });
    } else if (btn.classList.contains('btn-edit')) {
        const id = btn.dataset.id;
        const tx = currentTransactions.find(t => t.id === id);
        if (tx) {
            editIdInput.value = tx.id;
            document.getElementById('date-input').value = tx.data || '';
            document.getElementById('desc-input').value = tx.descricao;
            document.getElementById('amount-input').value = tx.valor;

            const catInput = document.getElementById('category-input');
            if (Array.from(catInput.options).some(opt => opt.value === tx.categoria)) {
                catInput.value = tx.categoria;
            } else {
                catInput.value = "Outros";
            }

            document.querySelector(`input[name="type"][value="${tx.tipo}"]`).checked = true;
            openFormModal(true);
        }
    } else if (btn.classList.contains('btn-toggle-paid')) {
        const id = btn.dataset.id;
        const currentStatus = btn.dataset.pago === 'true';

        FinanceService.togglePaidStatus(id, currentStatus)
            .then(() => {
                showToast(currentStatus ? 'Marcado como pendente' : 'Marcado como pago', 'success');
                updateDashboard();
            })
            .catch(err => {
                console.error("Erro ao alterar status: ", err);
                showToast('Erro ao atualizar status.', 'error');
            });
    }
});

// ==========================================
// FORMULÁRIO DE ENVIO (CREATE / UPDATE)
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const isEditing = editIdInput.value !== '';
    const btnTextOriginal = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="opacity-70">Processando...</span>`;

    const data = document.getElementById('date-input').value;
    const desc = document.getElementById('desc-input').value;
    const amount = document.getElementById('amount-input').value;
    const cat = document.getElementById('category-input').value;
    const type = document.querySelector('input[name="type"]:checked').value;

    try {
        if (isEditing) {
            await FinanceService.updateTransaction(editIdInput.value, data, desc, amount, type, cat);
            showToast('Lançamento atualizado!', 'success');
        } else {
            let installmentData = null;
            if (chkInstallment.checked) {
                installmentData = {
                    isInstallment: true,
                    current: document.getElementById('current-installment').value,
                    total: document.getElementById('total-installments').value
                };
            }
            await FinanceService.addTransaction(currentUser.uid, data, desc, amount, type, cat, installmentData);

            if (installmentData) {
                showToast(`As ${parseInt(installmentData.total) - parseInt(installmentData.current) + 1} parcelas foram geradas!`, 'success');
            } else {
                showToast('Lançamento adicionado!', 'success');
            }
        }
        closeFormModal();
        updateDashboard();
    } catch (error) {
        showToast('Falha ao processar operação.', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = btnTextOriginal;
    }
});

// ==========================================
// AUTENTICAÇÃO E START
// ==========================================
const loadDataForMonth = (mes) => {
    if (unsubscribeData) unsubscribeData();
    unsubscribeData = FinanceService.subscribeToTransactions(currentUser.uid, mes, (data) => {
        currentTransactions = data;
        renderList(currentTransactions);
        updateDashboard();
    });
};

monthSelector.addEventListener('change', (e) => {
    if (currentUser) loadDataForMonth(e.target.value);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => loginScreen.classList.add('hidden'), 500);

        mainApp.classList.remove('hidden');

        const photoURL = user.photoURL || 'https://via.placeholder.com/150';
        // Atualiza a imagem tanto no Desktop quanto no Mobile
        const avatarDesktop = document.getElementById('user-avatar');
        if (avatarDesktop) avatarDesktop.src = photoURL;

        const avatarMobile = document.getElementById('user-avatar-mobile');
        if (avatarMobile) avatarMobile.src = photoURL;

        // ADICIONADO: Exibe o nome do utilizador no perfil da Sidebar (Desktop)
        const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Usuário';
        const nameDisplay = document.getElementById('user-name-display');
        if (nameDisplay) nameDisplay.textContent = firstName;

        loadDataForMonth(monthSelector.value);
        showToast(`Bem-vindo, ${firstName}!`, 'success');
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        mainApp.classList.add('hidden');
        if (unsubscribeData) unsubscribeData();
    }
});

document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, provider));
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
// Listener para o botão de logout no mobile
const btnLogoutMobile = document.getElementById('btn-logout-mobile');
if (btnLogoutMobile) {
    btnLogoutMobile.addEventListener('click', () => signOut(auth));
}