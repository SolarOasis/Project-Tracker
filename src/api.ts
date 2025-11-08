// --- START OF CONFIGURATION ---
// IMPORTANT: Replace these placeholder values with your actual
// Google Apps Script URL and your secret API key.

const API_URL = "https://script.google.com/macros/s/AKfycbytqIGAMM7U_QEiIHYsi-896FoYkA4sr_KjQzJGa0urKiaKUOccOlhr8MXpwKM5eSky/exec";
const API_KEY = "sOlar-OasIs-Tr4cker-Secr3t-9xZ!q@w#";

// --- END OF CONFIGURATION ---

import { Project, Transaction, Todo, FollowUp, Category, Milestone, PaymentMilestone } from "./types";

type DataType = 'projects' | 'transactions' | 'todos' | 'followups' | 'categories';

interface ApiResponse {
    projects: Project[];
    transactions: Transaction[];
    todos: Todo[];
    followups: FollowUp[];
    categories: Category[];
}

// Function to fetch all data for a given user
export const fetchAllData = async (uid: string): Promise<ApiResponse> => {
    const response = await fetch(`${API_URL}?action=getAllData&uid=${uid}&apiKey=${API_KEY}`);
    if (!response.ok) {
        throw new Error("Failed to fetch data from the server.");
    }
    return response.json();
};

// Generic function to create or update an item
export const saveItem = async <T extends { id: string }>(type: DataType, item: Partial<T>, isNew: boolean): Promise<T> => {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8', // Required by Apps Script
        },
        body: JSON.stringify({
            apiKey: API_KEY,
            action: isNew ? 'create' : 'update',
            type,
            payload: item
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to save item. Server says: ${error.details || error.error}`);
    }
    return response.json();
};


// Function to delete an item
export const deleteItemById = async (type: DataType, id: string): Promise<void> => {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
            apiKey: API_KEY,
            action: 'delete',
            type,
            payload: { id }
        })
    });
     if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to delete item. Server says: ${error.details || error.error}`);
    }
};

// Specific function for updating milestones
export const batchUpdateMilestones = async (
    projectId: string, 
    milestones: Milestone[], 
    paymentMilestones: PaymentMilestone[]
): Promise<Project> => {
     const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
            apiKey: API_KEY,
            action: 'batchUpdate',
            type: 'projects', // This targets the project sheet
            payload: { projectId, milestones, paymentMilestones }
        })
    });
     if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to update milestones. Server says: ${error.details || error.error}`);
    }
    return response.json();
};