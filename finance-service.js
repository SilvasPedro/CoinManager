import { db } from './firebase-config.js';
// Adicionado o writeBatch nas importações
import { collection, doc, onSnapshot, query, where, updateDoc, deleteDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const collectionName = 'financas';

export const FinanceService = {
    
    subscribeToTransactions(userId, mesReferencia, callback) {
        const q = query(
            collection(db, collectionName), 
            where("uid", "==", userId),
            where("referencia", "==", mesReferencia)
        );
        return onSnapshot(q, (snapshot) => {
            const transactions = [];
            snapshot.forEach((doc) => { transactions.push({ id: doc.id, ...doc.data() }); });
            transactions.sort((a, b) => b.criadoEm - a.criadoEm);
            callback(transactions);
        });
    },

    // Função de utilidade para somar meses a uma data YYYY-MM-DD
    _addMonthsToDate(dateStr, monthsToAdd) {
        const [year, month, day] = dateStr.split('-').map(Number);
        // O Javascript cuida automaticamente se o mês passar de 12 e vira o ano
        const d = new Date(year, (month - 1) + monthsToAdd, day);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const newDay = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${newDay}`;
    },

    // CREATE atualizado para suportar Array de Lançamentos via WriteBatch
    async addTransaction(userId, dataInput, descricao, valor, tipo, categoria, installmentData = null) {
        const batch = writeBatch(db);

        if (installmentData && installmentData.isInstallment) {
            let current = parseInt(installmentData.current);
            let total = parseInt(installmentData.total);
            let monthsOffset = 0;

            for (let i = current; i <= total; i++) {
                const instDate = this._addMonthsToDate(dataInput, monthsOffset);
                const refMes = instDate.slice(0, 7);
                const instDesc = `${descricao} (${i}/${total})`;
                
                const docRef = doc(collection(db, collectionName));
                batch.set(docRef, {
                    uid: userId,
                    data: instDate,
                    descricao: instDesc,
                    valor: parseFloat(valor),
                    tipo: tipo,
                    categoria: categoria,
                    pago: true,
                    referencia: refMes,
                    criadoEm: Date.now() + monthsOffset // Offset mínimo p/ manter a ordem de criação
                });
                
                monthsOffset++;
            }
        } else {
            // Inserção Normal (Sem Parcelas)
            const referencia = dataInput.slice(0, 7);
            const docRef = doc(collection(db, collectionName));
            batch.set(docRef, {
                uid: userId,
                data: dataInput,
                descricao: descricao,
                valor: parseFloat(valor),
                tipo: tipo,
                categoria: categoria,
                pago: true,
                referencia: referencia,
                criadoEm: Date.now()
            });
        }

        await batch.commit();
    },

    // UPDATE
    async updateTransaction(id, dataInput, descricao, valor, tipo, categoria) {
        const referencia = dataInput.slice(0, 7);
        const docRef = doc(db, collectionName, id);
        await updateDoc(docRef, {
            data: dataInput,
            descricao: descricao,
            valor: parseFloat(valor),
            tipo: tipo,
            categoria: categoria,
            referencia: referencia
        });
    },

    // DELETE
    async deleteTransaction(id) {
        const docRef = doc(db, collectionName, id);
        await deleteDoc(docRef);
    },

    calculateTotals(transactions, investmentPercentage) {
        const totals = transactions.reduce((acc, curr) => {
            if (curr.tipo === 'entrada') acc.income += curr.valor;
            else if (curr.tipo === 'saida') acc.expense += curr.valor;
            return acc;
        }, { income: 0, expense: 0 });

        totals.balance = totals.income - totals.expense;
        totals.investment = totals.balance > 0 ? totals.balance * parseFloat(investmentPercentage) : 0;
        return totals;
    },

    async getEvolutionData(userId, mesSelecionado) {
        const q = query(collection(db, collectionName), where("uid", "==", userId));
        const snapshot = await getDocs(q);
        const dataByMonth = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const ref = data.referencia; 
            if (!dataByMonth[ref]) dataByMonth[ref] = { income: 0, expense: 0 };
            if (data.tipo === 'entrada') dataByMonth[ref].income += data.valor;
            else if (data.tipo === 'saida') dataByMonth[ref].expense += data.valor;
        });

        const [year, month] = mesSelecionado.split('-').map(Number);
        const last6Months = [];

        for (let i = 5; i >= 0; i--) {
            let d = new Date(year, month - 1 - i, 1);
            let y = d.getFullYear();
            let m = String(d.getMonth() + 1).padStart(2, '0');
            last6Months.push(`${y}-${m}`);
        }

        return last6Months.map(monthRef => {
            const mData = dataByMonth[monthRef] || { income: 0, expense: 0 };
            return { month: monthRef, balance: mData.income - mData.expense };
        }); 
    }
};