export interface Timestampable {
    created_at: string;
    updated_at: string;
}

export interface Milestone {
    name: string;
    completed: boolean;
    completedDate?: string;
}

export interface PaymentMilestone {
    label: string;
    amount: number;
    status: 'Pending' | 'Received';
    receivedDate?: string;
}

export interface Estimation {
    systemSizeKwp?: number;
    totalCapexBudget?: number;
    contingencyPercent?: number;
    vatPercent?: number;
    capexIncludesVat?: boolean;
}

export interface Project extends Timestampable {
    id: string;
    uid: string;
    name: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    clientCompany?: string;
    siteAddress: string;
    googleMapsLink?: string;
    authority: string;
    contractValue: number;
    expectedStartDate?: string;
    expectedEndDate?: string;
    status: 'Draft' | 'Active' | 'Closed' | 'Proposal' | 'Ongoing';
    notes?: string;
    estimation: Estimation;
    milestones: Milestone[];
    paymentMilestones: PaymentMilestone[];
    tags?: string[];
}

export interface Transaction extends Timestampable {
    id: string;
    project_id: string;
    uid: string;
    type: 'Income' | 'Expense';
    amount: number;
    date: string;
    description: string;
    category: string;
    paymentMode: string;
    vendor?: string;
    invoiceNo?: string;
}

export interface FollowUp extends Timestampable {
    id: string;
    project_id: string;
    uid: string;
    title: string;
    details: string;
    date: string;
    owner: string;
    status: 'Pending' | 'Completed';
    nextFollowUpDate?: string;
    repeatIntervalDays?: number;
}

export interface Todo extends Timestampable {
    id: string;
    project_id: string;
    uid: string;
    task: string;
    assignee?: string;
    priority: 'Low' | 'Medium' | 'High';
    dueDate?: string;
    status: 'Open' | 'Done';
    repeatIntervalDays?: number;
}

export interface Category extends Timestampable {
    id: string;
    uid: string;
    name: string;
}

export type ModalType =
    | 'project'
    | 'transaction'
    | 'category'
    | 'followup'
    | 'todo'
    | 'confirmDelete'
    | null;

export type EditableItem = Project | Transaction | Todo | FollowUp | Category;