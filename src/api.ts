// --- START OF CONFIGURATION ---
// IMPORTANT: Replace these placeholder values with your actual
// Google Apps Script URL and your secret API key.

const API_URL = "https://script.google.com/macros/s/AKfycbytqIGAMM7U_QEiIHYsi-896FoYkA4sr_KjQzJGa0urKiaKUOccOlhr8MXpwKM5eSky/exec";
const API_KEY = "sOlar-OasIs-Tr4cker-Secr3t-9xZ!q@w#";

// --- END OF CONFIGURATION ---

import { Project, Transaction, Todo, FollowUp, Category, Milestone, PaymentMilestone } from "./types";

interface ApiResponse {
    projects: Project[];
    transactions: Transaction[];
    todos: Todo[];
    followups: FollowUp[];
    categories: Category[];
}

// A private helper function to handle all POST requests to the API
const postRequest = async (body: object) => {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({ apiKey: API_KEY, ...body })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error", details: response.statusText }));
        throw new Error(`Failed API request. Server says: ${error.details || error.error}`);
    }
    // For delete actions which might not return a body, we don't try to parse json.
    if (response.headers.get("content-length") === "0") {
      return null;
    }
    return response.json();
};


// Function to fetch all data for a given user
export const fetchAllData = async (uid: string): Promise<ApiResponse> => {
    const response = await fetch(`${API_URL}?action=getAllData&uid=${uid}&apiKey=${API_KEY}`);
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Network error or invalid JSON response", details: response.statusText }));
        throw new Error(`Failed to fetch data. Server says: ${error.details || error.error}`);
    }
    return response.json();
};

// --- Specific Save/Create Functions ---
export const saveProject = (item: Partial<Project>, isNew: boolean): Promise<Project> => postRequest({ action: isNew ? 'create' : 'update', type: 'projects', payload: item });
export const saveTransaction = (item: Partial<Transaction>, isNew: boolean): Promise<Transaction> => postRequest({ action: isNew ? 'create' : 'update', type: 'transactions', payload: item });
export const saveTodo = (item: Partial<Todo>, isNew: boolean): Promise<Todo> => postRequest({ action: isNew ? 'create' : 'update', type: 'todos', payload: item });
export const saveFollowUp = (item: Partial<FollowUp>, isNew: boolean): Promise<FollowUp> => postRequest({ action: isNew ? 'create' : 'update', type: 'followups', payload: item });
export const saveCategory = (item: Partial<Category>, isNew: boolean): Promise<Category> => postRequest({ action: isNew ? 'create' : 'update', type: 'categories', payload: item });

// --- Specific Delete Functions ---
export const deleteProject = (id: string): Promise<void> => postRequest({ action: 'delete', type: 'projects', payload: { id } });
export const deleteTransaction = (id: string): Promise<void> => postRequest({ action: 'delete', type: 'transactions', payload: { id } });
export const deleteTodo = (id: string): Promise<void> => postRequest({ action: 'delete', type: 'todos', payload: { id } });
export const deleteFollowUp = (id: string): Promise<void> => postRequest({ action: 'delete', type: 'followups', payload: { id } });
export const deleteCategory = (id: string): Promise<void> => postRequest({ action: 'delete', type: 'categories', payload: { id } });


// Specific function for updating milestones
export const batchUpdateMilestones = (
    projectId: string, 
    milestones: Milestone[], 
    paymentMilestones: PaymentMilestone[]
): Promise<Project> => {
     return postRequest({
        action: 'batchUpdate',
        type: 'projects', // This targets the project sheet
        payload: { projectId, milestones, paymentMilestones }
    });
};