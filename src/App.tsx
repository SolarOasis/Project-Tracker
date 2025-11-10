import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import html2pdf from 'html2pdf.js';
import { Project, Transaction, FollowUp, Todo, Category, ModalType, Estimation, Milestone, PaymentMilestone, EditableItem } from './types';
import * as api from './api';


// ===================================================================================
// CONSTANTS & DEFAULTS
// ===================================================================================
const DEFAULT_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];
const PROJECT_STATUSES: Project['status'][] = ['Draft', 'Proposal', 'Active', 'Ongoing', 'Closed'];
const TODO_PRIORITIES: Todo['priority'][] = ['Low', 'Medium', 'High'];
const UAE_AUTHORITIES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quawain', 'Ras Al Khaimah', 'Fujairah'];

const DEFAULT_ESTIMATION: Estimation = {
    systemSizeKwp: 0,
    totalCapexBudget: 0,
    contingencyPercent: 0,
    vatPercent: 5,
    capexIncludesVat: false,
};

const DEFAULT_MILESTONES: Milestone[] = [
    { name: 'Proposal', completed: false },
    { name: 'Authority Approval', completed: false },
    { name: 'Material Procurement', completed: false },
    { name: 'Installation', completed: false },
    { name: 'Inspection', completed: false },
    { name: 'Commissioning', completed: false },
    { name: 'Final Handover', completed: false },
];

const DEFAULT_PAYMENT_MILESTONES: PaymentMilestone[] = [
    { label: 'Booking Payment', amount: 0, status: 'Pending' },
    { label: 'Installation Payment', amount: 0, status: 'Pending' },
    { label: 'Final Payment', amount: 0, status: 'Pending' },
];

const DEFAULT_PROJECT: Omit<Project, 'id' | 'uid' | 'created_at' | 'updated_at'> = {
    name: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    clientCompany: '',
    siteAddress: '',
    googleMapsLink: '',
    authority: UAE_AUTHORITIES[0],
    contractValue: 0,
    status: 'Draft',
    notes: '',
    estimation: DEFAULT_ESTIMATION,
    milestones: DEFAULT_MILESTONES,
    paymentMilestones: DEFAULT_PAYMENT_MILESTONES,
    tags: [],
};

const DEFAULT_TRANSACTION: Omit<Transaction, 'id' | 'uid' | 'created_at' | 'updated_at' | 'project_id'> = {
    type: 'Expense',
    amount: 0,
    date: new Date().toISOString(),
    description: '',
    category: '',
    paymentMode: DEFAULT_PAYMENT_MODES[0],
};

const DEFAULT_TODO: Omit<Todo, 'id' | 'uid' | 'created_at' | 'updated_at' | 'project_id'> = {
    task: '',
    priority: 'Medium',
    status: 'Open',
};

const DEFAULT_FOLLOWUP: Omit<FollowUp, 'id' | 'uid' | 'created_at' | 'updated_at' | 'project_id'> = {
    title: '',
    details: '',
    date: new Date().toISOString(),
    owner: '',
    status: 'Pending',
};

const DEFAULT_CATEGORY: Omit<Category, 'id' | 'uid' | 'created_at' | 'updated_at'> = {
    name: '',
};

// ===================================================================================
// GLOBAL APP CONTEXT
// ===================================================================================

interface AppContextType {
    userId: string | null;
    projects: Project[];
    transactions: Transaction[];
    todos: Todo[];
    followUps: FollowUp[];
    categories: Category[];
    selectedProjectId: string | null;
    setSelectedProjectId: (id: string | null) => void;
    
    saveProject: (data: Partial<Project>, existing: Project | null) => Promise<void>;
    saveTransaction: (data: Partial<Transaction>, existing: Transaction | null) => Promise<void>;
    saveTodo: (data: Partial<Todo>, existing: Todo | null) => Promise<void>;
    saveFollowUp: (data: Partial<FollowUp>, existing: FollowUp | null) => Promise<void>;
    saveCategory: (data: Partial<Category>, existing: Category | null) => Promise<void>;

    deleteProject: (id: string) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
    deleteTodo: (id: string) => Promise<void>;
    deleteFollowUp: (id: string) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;

    loadDemoData: () => void;
    showToast: (message: string, type?: 'success' | 'error') => void;
    updateProjectMilestones: (projectId: string, milestones: Milestone[]) => Promise<void>;
    updatePaymentMilestones: (projectId: string, paymentMilestones: PaymentMilestone[]) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppContext must be used within an AppProvider');
    return context;
};

// ===================================================================================
// HELPERS
// ===================================================================================
const useDebouncedCallback = (callback: (...args: any[]) => void, delay: number) => {
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        // Cleanup the timeout on component unmount
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const debouncedCallback = (...args: any[]) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
            callback(...args);
        }, delay);
    };

    return debouncedCallback;
};

const getOrCreateUserId = (): string => {
    const existingUserId = localStorage.getItem('solar_oasis_userId');
    if (existingUserId) {
        return existingUserId;
    }
    const newUserId = uuidv4();
    localStorage.setItem('solar_oasis_userId', newUserId);
    return newUserId;
};

const formatDate = (dateString?: string | Date) => {
    if (!dateString) return 'N/A';
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    if (!isValid(date)) return 'Invalid Date';
    return format(date, 'dd-MMM-yyyy');
};

const toInputDate = (dateString?: string | Date) => {
    if (!dateString) return '';
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    if (!isValid(date)) return '';
    return format(date, 'yyyy-MM-dd');
}

const safeNumber = (n: any): number => {
    const num = Number(n);
    return isFinite(num) ? num : 0;
};

const formatCurrency = (amount?: number) => {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }).format(safeNumber(amount));
};

const exportToCsv = (filename: string, rows: (string | number | undefined | null)[][]) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")).join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const isEmailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isPhoneValid = (phone: string) => /^\+?[0-9\s-()]{7,}$/.test(phone);

// ===================================================================================
// SVG IONS & UI COMPONENTS
// ===================================================================================
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>;
const ClipboardCopyIcon = ({ className = "h-5 w-5" }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m-6 4h.01M9 16h.01" /></svg>;
const MapPinIcon = ({ className = "h-5 w-5" }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.1.4-.27.6-.5s.4-.51.5-.82c.1-.31.1-.65.1-1.01V5.75a1 1 0 00-1-1H4a1 1 0 00-1 1v7.25c0 .36.002.7.1 1.01.1.31.2.52.5.82s.4.4.6.5c.18.13.395.24.6.34.09.03.18.06.28.09l.018.008.006.003zM10 16.5a1 1 0 00-1 1v.083c0 .03.002.05.005.071.002.015.007.03.012.044s.01.028.017.04.015.022.023.032c.084.103.22.22.4.333.18.114.33.2.4.242.07.042.1.06.1.06s.03-.018.1-.06a2.12 2.12 0 00.4-.242c.18-.113.315-.23.4-.333.008-.01.015-.02.023-.032a.5.5 0 00.017-.04.6.6 0 00.012-.044c.003-.02.005-.04.005-.07V17.5a1 1 0 00-1-1h-2z" clipRule="evenodd" /></svg>;

// FIX: Converted to const arrow function with explicit props type to fix TS inference issues.
type CardProps = {
    // FIX: Made children optional to fix TS errors where it was incorrectly reported as missing.
    children?: React.ReactNode;
    className?: string;
};
const Card = ({ children, className }: CardProps) => {
    return <div className={`bg-white rounded-xl shadow-md p-6 ${className}`}>{children}</div>;
};

// FIX: Converted to const arrow function with explicit props type to fix TS inference issues.
type ButtonProps = {
    // FIX: Made children optional to fix TS errors where it was incorrectly reported as missing.
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
};
const Button = ({ children, onClick, className, type = "button", disabled }: ButtonProps) => {
    return <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>{children}</button>;
};

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string, error?: string }>(({ label, name, error, ...props }, ref) => {
    return (
        <div className="w-full">
            {label && <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
            <input
                id={name}
                name={name}
                ref={ref}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-brand-yellow focus:border-brand-yellow sm:text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
                {...props}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
});

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string, error?: string }>(({ label, name, error, ...props }, ref) => {
    return (
        <div className="w-full">
            {label && <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
            <textarea
                id={name}
                name={name}
                ref={ref}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-brand-yellow focus:border-brand-yellow sm:text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
                {...props}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
});

// FIX: Extracted props to a type alias to fix TS inference issues.
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string,
    error?: string,
    children: React.ReactNode
};
const Select = ({ label, name, error, children, ...props }: SelectProps) => {
    return (
        <div className="w-full">
            {label && <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
            <select
                id={name}
                name={name}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-brand-yellow focus:border-brand-yellow sm:text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
                {...props}
            >
                {children}
            </select>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
};

// FIX: Converted to const arrow function with explicit props type to fix TS inference issues.
type ModalProps = {
    // FIX: Made children optional to fix TS errors where it was incorrectly reported as missing.
    children?: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title: string;
};
const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b sticky top-0 bg-white z-10">
                    <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-bold text-brand-indigo">{title}</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

const Toast = ({ message, show, type = 'success' }: { message: string; show: boolean; type?: 'success' | 'error' }) => <div className={`fixed bottom-5 right-5 p-4 rounded-lg text-white shadow-lg transition-transform transform ${show ? 'translate-x-0' : 'translate-x-full'} ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message}</div>;
const EmptyState = ({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) => <div className="text-center py-12 px-6 bg-gray-50 rounded-lg"><h3 className="text-lg font-medium text-gray-900">{title}</h3><p className="mt-1 text-sm text-gray-500">{message}</p>{action && <div className="mt-6">{action}</div>}</div>;

// ===================================================================================
// APP PROVIDER & MAIN COMPONENT
// ===================================================================================

const AppProvider = ({ children }: { children: React.ReactNode }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; show: boolean; type: 'success' | 'error' }>({ message: '', show: false, type: 'success' });

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type, show: true });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const setSelectedProjectId = (id: string | null) => {
        setSelectedProjectIdState(id);
        if (id) {
            localStorage.setItem('last_selected_projectId', id);
        } else {
            localStorage.removeItem('last_selected_projectId');
        }
    };

    useEffect(() => {
        const currentUserId = getOrCreateUserId();
        setUserId(currentUserId);

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const data = await api.fetchAllData(currentUserId);
                const projectsList = data.projects || [];
                setProjects(projectsList);
                setTransactions(data.transactions || []);
                setTodos(data.todos || []);
                setFollowUps(data.followups || []);
                
                if (data.categories && data.categories.length > 0) {
                    setCategories(data.categories);
                } else {
                    const hasSeededCategories = localStorage.getItem(`seeded_categories_${currentUserId}`);
                    if (!hasSeededCategories) {
                        const defaultCategoryNames = ['Panels', 'Inverter', 'Mounting', 'Cables', 'Labour', 'Logistics', 'Permits', 'Misc'];
                        const newCategories: Category[] = defaultCategoryNames.map(name => ({
                            id: uuidv4(),
                            uid: currentUserId,
                            name,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }));
                        setCategories(newCategories);
                        
                        Promise.all(newCategories.map(cat => api.saveCategory(cat, true)))
                            .then(() => {
                                console.log("Default categories seeded successfully.");
                                localStorage.setItem(`seeded_categories_${currentUserId}`, 'true');
                            })
                            .catch(err => {
                               console.error("Failed to seed default categories:", err);
                               showToast("Could not save initial categories. Please refresh.", "error");
                            });
                    } else {
                        setCategories([]); 
                    }
                }

                const lastSelectedId = localStorage.getItem('last_selected_projectId');
                if (lastSelectedId && projectsList.some(p => p.id === lastSelectedId)) {
                    setSelectedProjectIdState(lastSelectedId);
                } else if (projectsList.length > 0) {
                    setSelectedProjectIdState(projectsList[0].id);
                }
            } catch (error) {
                console.error(error);
                const errorMessage = error instanceof Error ? error.message : "Failed to load data from the server.";
                showToast(errorMessage, "error");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- Type-Safe, Dedicated State Management Functions ---

    const saveProject = async (data: Partial<Project>, existing: Project | null) => {
        if (!userId) {
            showToast("User ID not found. Cannot save.", "error");
            return;
        }
        const isNew = !existing;
        const now = new Date().toISOString();
        const optimisticItem: Project = isNew 
            ? { ...DEFAULT_PROJECT, ...data, id: uuidv4(), uid: userId, created_at: now, updated_at: now }
            : { ...existing!, ...data, updated_at: now };

        const originalState = [...projects];
        setProjects(prev => isNew ? [...prev, optimisticItem] : prev.map(p => p.id === optimisticItem.id ? optimisticItem : p));

        try {
            const savedItem = await api.saveProject(optimisticItem, isNew);
            setProjects(prev => prev.map(p => p.id === optimisticItem.id ? savedItem : p)); // Update with server response
        } catch (error) {
            showToast(`Error ${isNew ? 'creating' : 'updating'} project. Reverting.`, "error");
            setProjects(originalState); // Revert on failure
        }
    };
    
    const deleteProject = async (id: string) => {
        const originalProjects = [...projects];
        const originalTransactions = [...transactions];
        const originalTodos = [...todos];
        const originalFollowUps = [...followUps];
        
        setProjects(prev => prev.filter(p => p.id !== id));
        setTransactions(prev => prev.filter(t => t.project_id !== id));
        setTodos(prev => prev.filter(t => t.project_id !== id));
        setFollowUps(prev => prev.filter(f => f.project_id !== id));

        if (selectedProjectId === id) {
            const remaining = originalProjects.filter(p => p.id !== id);
            setSelectedProjectId(remaining.length > 0 ? remaining[0].id : null);
        }

        try {
            await api.deleteProject(id);
        } catch (error) {
            showToast(`Error deleting project. Reverting.`, "error");
            setProjects(originalProjects);
            setTransactions(originalTransactions);
            setTodos(originalTodos);
            setFollowUps(originalFollowUps);
        }
    };

    const saveTransaction = async (data: Partial<Transaction>, existing: Transaction | null) => {
        if (!userId) {
            showToast("User ID not found.", "error");
            return;
        }
        const isNew = !existing;
        const now = new Date().toISOString();
        if (isNew && !data.project_id) {
            showToast("Cannot create transaction without a project.", "error");
            return;
        }
        
        const optimisticItem: Transaction = isNew
            ? { ...DEFAULT_TRANSACTION, ...data, project_id: data.project_id!, id: uuidv4(), uid: userId, created_at: now, updated_at: now }
            : { ...existing!, ...data, updated_at: now };
        
        const originalState = [...transactions];
        setTransactions(prev => isNew ? [...prev, optimisticItem] : prev.map(i => i.id === optimisticItem.id ? optimisticItem : i));
        
        try {
            const savedItem = await api.saveTransaction(optimisticItem, isNew);
            setTransactions(prev => prev.map(i => i.id === optimisticItem.id ? savedItem : i));
        } catch (error) {
            showToast("Error saving transaction. Reverting.", "error");
            setTransactions(originalState);
        }
    };

    const deleteTransaction = async (id: string) => {
        const originalState = [...transactions];
        setTransactions(prev => prev.filter(i => i.id !== id));
        try {
            await api.deleteTransaction(id);
        } catch (error) {
            showToast("Error deleting transaction. Reverting.", "error");
            setTransactions(originalState);
        }
    };

    const saveTodo = async (data: Partial<Todo>, existing: Todo | null) => {
        if (!userId) {
            showToast("User ID not found.", "error");
            return;
        }
        const isNew = !existing;
        const now = new Date().toISOString();
        if (isNew && !data.project_id) {
            showToast("Cannot create to-do without a project.", "error");
            return;
        }

        const optimisticItem: Todo = isNew
            ? { ...DEFAULT_TODO, ...data, project_id: data.project_id!, id: uuidv4(), uid: userId, created_at: now, updated_at: now }
            : { ...existing!, ...data, updated_at: now };

        const originalState = [...todos];
        setTodos(prev => isNew ? [...prev, optimisticItem] : prev.map(i => i.id === optimisticItem.id ? optimisticItem : i));

        try {
            const savedItem = await api.saveTodo(optimisticItem, isNew);
            setTodos(prev => prev.map(i => i.id === optimisticItem.id ? savedItem : i));
        } catch (error) {
            showToast("Error saving to-do. Reverting.", "error");
            setTodos(originalState);
        }
    };

    const deleteTodo = async (id: string) => {
        const originalState = [...todos];
        setTodos(prev => prev.filter(i => i.id !== id));
        try {
            await api.deleteTodo(id);
        } catch (error) {
            showToast("Error deleting to-do. Reverting.", "error");
            setTodos(originalState);
        }
    };
    
    const saveFollowUp = async (data: Partial<FollowUp>, existing: FollowUp | null) => {
        if (!userId) {
            showToast("User ID not found.", "error");
            return;
        }
        const isNew = !existing;
        const now = new Date().toISOString();
        if (isNew && !data.project_id) {
            showToast("Cannot create follow-up without a project.", "error");
            return;
        }

        const optimisticItem: FollowUp = isNew
            ? { ...DEFAULT_FOLLOWUP, ...data, project_id: data.project_id!, id: uuidv4(), uid: userId, created_at: now, updated_at: now }
            : { ...existing!, ...data, updated_at: now };

        const originalState = [...followUps];
        setFollowUps(prev => isNew ? [...prev, optimisticItem] : prev.map(i => i.id === optimisticItem.id ? optimisticItem : i));

        try {
            const savedItem = await api.saveFollowUp(optimisticItem, isNew);
            setFollowUps(prev => prev.map(i => i.id === optimisticItem.id ? savedItem : i));
        } catch (error) {
            showToast("Error saving follow-up. Reverting.", "error");
            setFollowUps(originalState);
        }
    };

    const deleteFollowUp = async (id: string) => {
        const originalState = [...followUps];
        setFollowUps(prev => prev.filter(i => i.id !== id));
        try {
            await api.deleteFollowUp(id);
        } catch (error) {
            showToast("Error deleting follow-up. Reverting.", "error");
            setFollowUps(originalState);
        }
    };

    const saveCategory = async (data: Partial<Category>, existing: Category | null) => {
        if (!userId) {
            showToast("User ID not found.", "error");
            return;
        }
        const isNew = !existing;
        const now = new Date().toISOString();
        
        const optimisticItem: Category = isNew
            ? { ...DEFAULT_CATEGORY, ...data, id: uuidv4(), uid: userId, created_at: now, updated_at: now }
            : { ...existing!, ...data, updated_at: now };

        const originalState = [...categories];
        setCategories(prev => isNew ? [...prev, optimisticItem] : prev.map(i => i.id === optimisticItem.id ? optimisticItem : i));
        
        try {
            const savedItem = await api.saveCategory(optimisticItem, isNew);
            setCategories(prev => prev.map(i => i.id === optimisticItem.id ? savedItem : i));
        } catch (error) {
            showToast("Error saving category. Reverting.", "error");
            setCategories(originalState);
        }
    };

    const deleteCategory = async (id: string) => {
        const originalState = [...categories];
        setCategories(prev => prev.filter(i => i.id !== id));
        try {
            await api.deleteCategory(id);
        } catch (error) {
            showToast("Error deleting category. Reverting.", "error");
            setCategories(originalState);
        }
    };
    
    const batchUpdate = async (projectId: string, milestones: Milestone[], paymentMilestones: PaymentMilestone[]) => {
        const originalProject = projects.find(p => p.id === projectId);
        if (!originalProject) return;

        const updatedProject = { ...originalProject, milestones, paymentMilestones, updated_at: new Date().toISOString() };
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));

        try {
            const serverUpdatedProject = await api.batchUpdateMilestones(projectId, milestones, paymentMilestones);
            setProjects(prev => prev.map(p => p.id === projectId ? serverUpdatedProject : p));
        } catch(error) {
            showToast("Failed to update milestones. Reverting.", "error");
            setProjects(prev => prev.map(p => p.id === projectId ? originalProject : p));
        }
   }

    const updateProjectMilestones = async (projectId: string, milestones: Milestone[]) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        await batchUpdate(projectId, milestones, project.paymentMilestones);
    };

    const updatePaymentMilestones = async (projectId: string, paymentMilestones: PaymentMilestone[]) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        await batchUpdate(projectId, project.milestones, paymentMilestones);
    };
    
    const loadDemoData = async () => {
        showToast("Demo data feature is not available with this backend.", "error");
    };

    const value = { userId, projects, transactions, todos, followUps, categories, selectedProjectId, setSelectedProjectId, loadDemoData, showToast, updateProjectMilestones, updatePaymentMilestones, saveProject, saveTransaction, saveTodo, saveFollowUp, saveCategory, deleteProject, deleteTransaction, deleteTodo, deleteFollowUp, deleteCategory };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-semibold text-brand-indigo">Loading Solar Oasis Tracker...</div></div>;
    }

    return (
        <AppContext.Provider value={value}>
            {children}
            <Toast {...toast} />
        </AppContext.Provider>
    );
};

const App = () => (
    <AppProvider>
        <AppLayout />
    </AppProvider>
);

const AppLayout = () => {
    const { deleteProject } = useAppContext();
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [editingItem, setEditingItem] = useState<EditableItem | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{ onConfirm: () => Promise<void>; name: string } | null>(null);

    const handleOpenModal = (type: ModalType, item: EditableItem | null = null) => {
        setEditingItem(item);
        setActiveModal(type);
    };
    
    const handleCloseModal = () => {
        setEditingItem(null);
        setActiveModal(null);
        setItemToDelete(null);
    };

    const { projects, selectedProjectId } = useAppContext();
    const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

    return (
        <div className="h-screen w-screen bg-gray-100 flex flex-col font-sans">
            <header className="bg-brand-indigo text-white p-4 flex items-center justify-between shadow-lg no-print">
                <div className="flex items-center gap-4">
                    <svg className="h-10 w-10 text-brand-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    <h1 className="text-xl md:text-2xl font-bold tracking-wider">Solar Oasis Project Tracker</h1>
                </div>
            </header>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                <ProjectSidebar onNewProject={() => handleOpenModal('project')} />
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                   {selectedProject ? (
                        <ProjectDetail
                            project={selectedProject}
                            onEdit={() => handleOpenModal('project', selectedProject)}
                            onDelete={() => {setItemToDelete({ onConfirm: () => deleteProject(selectedProject.id), name: `Project "${selectedProject.name}"` }); setActiveModal('confirmDelete');}}
                            openModal={handleOpenModal}
                        />
                   ) : (
                       <div className="flex items-center justify-center h-full">
                           <Card className="max-w-md w-full text-center p-8 md:p-12">
                                <h3 className="text-xl font-bold text-gray-800">No Project Selected</h3>
                                <p className="mt-2 text-base text-gray-500">
                                    Create a new project or select one from the list to get started.
                                </p>
                                <div className="mt-8">
                                    <Button onClick={() => handleOpenModal('project')} className="bg-brand-yellow text-brand-indigo hover:bg-yellow-300 inline-flex">
                                        <PlusIcon /> Create First Project
                                    </Button>
                                </div>
                            </Card>
                       </div>
                   )}
                </main>
            </div>
            <Modals activeModal={activeModal} editingItem={editingItem} itemToDelete={itemToDelete} handleCloseModal={handleCloseModal} />
        </div>
    );
};

const ProjectSidebar = ({onNewProject}: {onNewProject: () => void}) => {
    const { projects, selectedProjectId, setSelectedProjectId } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<{ status: string; authority: string }>({ status: 'all', authority: 'all' });
    const [sort, setSort] = useState('updated_at_desc');
    const authorities = useMemo(() => Array.from(new Set(projects.map(p => p.authority).filter(Boolean))), [projects]);

    const filteredAndSortedProjects = useMemo(() => {
        return projects
            .filter(p => searchTerm ? p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) : true)
            .filter(p => filters.status === 'all' ? true : p.status === filters.status)
            .filter(p => filters.authority === 'all' ? true : p.authority === filters.authority)
            .sort((a, b) => {
                switch (sort) {
                    case 'name_asc': return a.name.localeCompare(b.name);
                    case 'created_at_desc': {
                        const dateA = parseISO(a.created_at ?? '0');
                        const dateB = parseISO(b.created_at ?? '0');
                        return dateB.getTime() - dateA.getTime();
                    }
                    case 'updated_at_desc': {
                        const dateA = parseISO(a.updated_at ?? '0');
                        const dateB = parseISO(b.updated_at ?? '0');
                        return dateB.getTime() - dateA.getTime();
                    }
                    default: return 0;
                }
            });
    }, [projects, searchTerm, filters, sort]);
    
    return (
         <aside className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-gray-200 overflow-y-auto no-print flex flex-col flex-shrink-0">
            <div className="p-4 border-b">
                <Button onClick={onNewProject} className="w-full bg-brand-yellow text-brand-indigo hover:bg-yellow-300"><PlusIcon /> New Project</Button>
            </div>
            <div className="p-4 border-b space-y-3">
                <Input placeholder="Search project or client..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                    <Select value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))}><option value="all">All Statuses</option>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</Select>
                    <Select value={filters.authority} onChange={e => setFilters(f => ({...f, authority: e.target.value}))}><option value="all">All Authorities</option>{authorities.map(a => <option key={a} value={a}>{a}</option>)}</Select>
                </div>
                <Select value={sort} onChange={e => setSort(e.target.value)}><option value="updated_at_desc">Sort by Last Updated</option><option value="created_at_desc">Sort by Created Date</option><option value="name_asc">Sort by Name</option></Select>
            </div>
            <nav className="flex-1 overflow-y-auto">
                {filteredAndSortedProjects.length > 0 ? (
                    <ul>{filteredAndSortedProjects.map(project => (<li key={project.id}><a href="#" onClick={(e) => { e.preventDefault(); setSelectedProjectId(project.id); }} className={`block px-4 py-3 text-sm transition-colors duration-200 ${selectedProjectId === project.id ? 'bg-brand-indigo text-white' : 'text-gray-700 hover:bg-gray-100'}`}><div className="font-bold truncate">{project.name}</div><div className="text-xs opacity-80 truncate">{project.clientName}</div></a></li>))}</ul>
                ) : (<p className="p-4 text-sm text-gray-500">No projects match your search or filters.</p>)}
            </nav>
        </aside>
    )
};

const Modals = ({ activeModal, editingItem, itemToDelete, handleCloseModal }: { activeModal: ModalType; editingItem: EditableItem | null; itemToDelete: { onConfirm: () => Promise<void>; name: string } | null; handleCloseModal: () => void; }) => {
    const { saveProject, saveTransaction, saveFollowUp, saveTodo, saveCategory, deleteCategory, showToast, categories, selectedProjectId } = useAppContext();
    const { projects } = useAppContext();
    const project = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

    const handleDelete = async () => {
        if (!itemToDelete) return;
        await itemToDelete.onConfirm();
        showToast(`${itemToDelete.name} deleted successfully.`);
        handleCloseModal();
    }
    
    return (
        <>
            <ProjectFormModal isOpen={activeModal === 'project'} onClose={handleCloseModal} project={editingItem as Project | null} onSave={saveProject} onSuccess={showToast} />
            {project && (
                <>
                <TransactionFormModal isOpen={activeModal === 'transaction'} onClose={handleCloseModal} transaction={editingItem as Transaction | null} projectId={project.id} onSave={saveTransaction} onSuccess={showToast} />
                <FollowUpFormModal isOpen={activeModal === 'followup'} onClose={handleCloseModal} followUp={editingItem as FollowUp | null} projectId={project.id} onSave={saveFollowUp} onSuccess={showToast} />
                <TodoFormModal isOpen={activeModal === 'todo'} onClose={handleCloseModal} todo={editingItem as Todo | null} projectId={project.id} onSave={saveTodo} onSuccess={showToast} />
                </>
            )}
            <CategoryManagerModal isOpen={activeModal === 'category'} onClose={handleCloseModal} categories={categories} onSave={saveCategory} onDelete={deleteCategory} onSuccess={showToast} />
            <Modal isOpen={activeModal === 'confirmDelete'} onClose={handleCloseModal} title="Confirm Deletion">
                <p>Are you sure you want to delete {itemToDelete?.name ? `the ${itemToDelete.name.toLowerCase()}` : 'this item'}? This action cannot be undone.</p>
                <div className="mt-6 flex justify-end gap-4"><Button onClick={handleCloseModal} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button><Button onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">Delete</Button></div>
            </Modal>
        </>
    )
};

const ProjectDetail = ({ project, onEdit, onDelete, openModal }: { project: Project; onEdit: () => void; onDelete: () => void; openModal: (type: ModalType, item?: EditableItem | null) => void; }) => {
    const { transactions, todos, followUps, deleteTransaction, deleteFollowUp, deleteTodo, saveTodo } = useAppContext();
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [itemToDelete, setItemToDelete] = useState<{ onConfirm: () => Promise<void>; name: string } | null>(null);
    const [activeTab, setActiveTab] = useState('transactions');
    const printRef = useRef<HTMLDivElement>(null);
    const projectTransactions = useMemo(() => transactions.filter(t => t.project_id === project.id), [transactions, project.id]);
    const projectTodos = useMemo(() => todos.filter(t => t.project_id === project.id), [todos, project.id]);
    const projectFollowUps = useMemo(() => followUps.filter(f => f.project_id === project.id), [followUps, project.id]);
    
    const calculations = useMemo(() => {
        const totalRevenue = projectTransactions.filter(t => t.type === 'Income').reduce((sum, t) => sum + safeNumber(t.amount), 0);
        const totalExpenses = projectTransactions.filter(t => t.type === 'Expense').reduce((sum, t) => sum + safeNumber(t.amount), 0);
        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const est = project.estimation || {};
        const estimatedCapEx = (safeNumber(est.totalCapexBudget) * (1 + safeNumber(est.contingencyPercent) / 100)) * (est.capexIncludesVat ? (1 + safeNumber(est.vatPercent) / 100) : 1);
        const estimatedRevenue = safeNumber(project.contractValue);
        const estimatedGrossProfit = estimatedRevenue - estimatedCapEx;
        const estimatedMargin = estimatedRevenue > 0 ? (estimatedGrossProfit / estimatedRevenue) * 100 : 0;
        return { totalRevenue, totalExpenses, netProfit, profitMargin, estimatedCapEx, estimatedRevenue, estimatedGrossProfit, estimatedMargin };
    }, [project, projectTransactions]);

    const handlePrint = () => {
         const element = printRef.current;
         if (!element) return;
        html2pdf().from(element).set({
            margin: 0.5,
            filename: `project_${project.name.replace(/\s/g, '_')}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
        }).save();
    };

    const confirmDelete = (onConfirm: () => Promise<void>, name: string) => {
      setItemToDelete({ onConfirm, name });
      setActiveModal('confirmDelete');
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-brand-indigo">{project.name}</h2>
                    <p className="text-gray-500">{project.siteAddress}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${project.status === 'Active' || project.status === 'Ongoing' ? 'bg-green-100 text-green-800' : project.status === 'Closed' ? 'bg-gray-200 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>{project.status}</span>
                        {project.tags?.map(tag => <span key={tag} className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">{tag}</span>)}
                    </div>
                </div>
                <div className="flex gap-2"><Button onClick={onEdit} className="bg-gray-200 text-gray-800 hover:bg-gray-300"><PencilIcon/></Button><Button onClick={onDelete} className="bg-red-100 text-red-800 hover:bg-red-200"><TrashIcon/></Button></div>
            </div>
            <ClientInfoCard project={project} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><EstimationVsActualsCard calcs={calculations} /><FinancialsCard calcs={calculations} /></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ProjectMilestonesTracker project={project} /><PaymentMilestonesTracker project={project} /></div>
            <div className="no-print">
                <div className="border-b border-gray-200"><nav className="-mb-px flex space-x-8" aria-label="Tabs">{['transactions', 'breakdowns', 'followups', 'todos', 'reports'].map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${activeTab === tab ? 'border-brand-yellow text-brand-indigo' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>{tab}</button>)}</nav></div>
                <div className="mt-8">
                    {activeTab === 'transactions' && <TransactionsTab transactions={projectTransactions} openModal={openModal} onDelete={(id) => confirmDelete(() => deleteTransaction(id), 'Transaction')} />}
                    {activeTab === 'breakdowns' && <BreakdownsTab transactions={projectTransactions} />}
                    {activeTab === 'followups' && <FollowUpsTab followUps={projectFollowUps} openModal={openModal} onDelete={(id) => confirmDelete(() => deleteFollowUp(id), 'Follow-up')} />}
                    {activeTab === 'todos' && <TodosTab todos={projectTodos} openModal={openModal} onToggle={(todo) => saveTodo({ status: todo.status === 'Open' ? 'Done' : 'Open' }, todo)} onDelete={(id) => confirmDelete(() => deleteTodo(id), 'To-do')} />}
                    {activeTab === 'reports' && <ReportsTab project={project} transactions={projectTransactions} followUps={projectFollowUps} todos={projectTodos} handlePrint={handlePrint} />}
                </div>
            </div>
            <div className="fixed top-0 -left-[9999px] opacity-0" ref={printRef}><PrintableView project={project} transactions={projectTransactions} calcs={calculations} /></div>
            <Modals activeModal={activeModal} editingItem={null} itemToDelete={itemToDelete} handleCloseModal={() => { setActiveModal(null); setItemToDelete(null); }}/>
        </div>
    );
};

const ClientInfoCard = ({ project }: { project: Project }) => {
    const { showToast } = useAppContext();
    const copyToClipboard = (text: string, label: string) => { navigator.clipboard.writeText(text).then(() => showToast(`${label} copied!`)); };
    return (
        <Card className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-center">
            <div><div className="font-semibold text-gray-800">{project.clientName}</div>{project.clientCompany && <div className="text-sm text-gray-500">{project.clientCompany}</div>}</div>
            <div className="space-y-2"><div className="flex items-center gap-2 text-sm"><span className="text-gray-600 truncate">{project.clientPhone}</span><button onClick={() => copyToClipboard(project.clientPhone, 'Phone')} className="text-gray-400 hover:text-brand-indigo"><ClipboardCopyIcon className="h-4 w-4" /></button></div><div className="flex items-center gap-2 text-sm"><span className="text-gray-600 truncate">{project.clientEmail}</span><button onClick={() => copyToClipboard(project.clientEmail, 'Email')} className="text-gray-400 hover:text-brand-indigo"><ClipboardCopyIcon className="h-4 w-4" /></button></div></div>
            <div className="space-y-2"><div className="text-sm text-gray-600">Authority: <span className="font-semibold text-gray-800">{project.authority}</span></div>{project.googleMapsLink && <a href={project.googleMapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline"><MapPinIcon className="h-4 w-4" /> Open Maps</a>}</div>
        </Card>
    );
};

const EstimationVsActualsCard = ({ calcs }: { calcs: any }) => (
    <Card><h4 className="font-bold text-lg text-brand-indigo mb-4">Estimation vs. Actuals</h4><div className="space-y-2 text-sm"><div className="grid grid-cols-3 gap-2 font-semibold"><span></span><span className="text-right">Estimated</span><span className="text-right">Actual</span></div><div className="grid grid-cols-3 gap-2 border-t pt-2"><span className="text-gray-600">Revenue</span><span className="text-right">{formatCurrency(calcs.estimatedRevenue)}</span><span className="text-right text-green-600 font-semibold">{formatCurrency(calcs.totalRevenue)}</span></div><div className="grid grid-cols-3 gap-2"><span className="text-gray-600">Expenses</span><span className="text-right">{formatCurrency(calcs.estimatedCapEx)}</span><span className="text-right text-red-600 font-semibold">{formatCurrency(calcs.totalExpenses)}</span></div><div className="grid grid-cols-3 gap-2 border-t pt-2 font-bold"><span className="text-gray-800">Gross Profit</span><span className="text-right">{formatCurrency(calcs.estimatedGrossProfit)}</span><span className="text-right text-blue-600">{formatCurrency(calcs.netProfit)}</span></div><div className="grid grid-cols-3 gap-2"><span className="text-gray-800">Margin</span><span className="text-right">{calcs.estimatedMargin.toFixed(2)}%</span><span className={`text-right ${calcs.profitMargin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{calcs.profitMargin.toFixed(2)}%</span></div></div></Card>
);

const FinancialsCard = ({ calcs }: { calcs: any }) => (
    <Card className="flex flex-col justify-between"><h4 className="font-bold text-lg text-brand-indigo mb-4">Actual Financials</h4><div className="space-y-3"><div><div className="text-sm text-gray-500">Total Revenue</div><div className="text-2xl font-bold text-green-600">{formatCurrency(calcs.totalRevenue)}</div></div><div><div className="text-sm text-gray-500">Total Expenses</div><div className="text-2xl font-bold text-red-600">{formatCurrency(calcs.totalExpenses)}</div></div><div className="border-t pt-3"><div className="text-sm text-gray-500">Net Profit / Loss</div><div className={`text-3xl font-extrabold ${calcs.netProfit >= 0 ? 'text-brand-indigo' : 'text-red-700'}`}>{formatCurrency(calcs.netProfit)}</div></div></div></Card>
);

const ProjectMilestonesTracker = ({ project }: { project: Project }) => {
    const { updateProjectMilestones } = useAppContext();
    const [localMilestones, setLocalMilestones] = useState(project.milestones);

    const debouncedUpdate = useDebouncedCallback((projectId: string, milestones: Milestone[]) => {
        updateProjectMilestones(projectId, milestones);
    }, 300);

    useEffect(() => {
        setLocalMilestones(project.milestones);
    }, [project.milestones]);

    const handleToggle = (index: number) => {
        const newMilestones = localMilestones.map((m, i) =>
            i === index
                ? { ...m, completed: !m.completed, completedDate: !m.completed ? new Date().toISOString() : undefined }
                : m
        );
        setLocalMilestones(newMilestones);
        debouncedUpdate(project.id, newMilestones);
    };

    return (<Card><h4 className="font-bold text-lg text-brand-indigo mb-4">Project Milestones</h4><div className="space-y-3">{localMilestones.map((milestone, index) => (<div key={index} className="flex items-center justify-between"><div className="flex items-center"><input type="checkbox" checked={milestone.completed} onChange={() => handleToggle(index)} className="h-5 w-5 rounded border-gray-300 text-brand-indigo focus:ring-brand-yellow" /><label className={`ml-3 text-sm ${milestone.completed ? 'text-gray-500 line-through' : 'text-gray-700'}`}>{milestone.name}</label></div>{milestone.completed && milestone.completedDate && <span className="text-xs text-gray-400">{formatDate(milestone.completedDate)}</span>}</div>))}</div></Card>);
};

const PaymentMilestonesTracker = ({ project }: { project: Project }) => {
    const { updatePaymentMilestones } = useAppContext();
    const [localMilestones, setLocalMilestones] = useState(project.paymentMilestones);

    const debouncedUpdate = useDebouncedCallback((projectId: string, milestones: PaymentMilestone[]) => {
        updatePaymentMilestones(projectId, milestones);
    }, 500);

    useEffect(() => {
        setLocalMilestones(project.paymentMilestones);
    }, [project.paymentMilestones]);

    const handleUpdate = (index: number, field: keyof PaymentMilestone, value: any) => {
        const newMilestones = localMilestones.map((m, i) => {
            if (i === index) {
                const updated = { ...m, [field]: value };
                if (field === 'status' && value === 'Received' && m.status !== 'Received') {
                    updated.receivedDate = new Date().toISOString();
                } else if (field === 'status' && value === 'Pending') {
                    updated.receivedDate = undefined;
                }
                return updated;
            }
            return m;
        });
        setLocalMilestones(newMilestones);
        debouncedUpdate(project.id, newMilestones);
    };

    const totalAmount = localMilestones.reduce((sum, m) => sum + safeNumber(m.amount), 0);
    const totalReceived = localMilestones.filter(m => m.status === 'Received').reduce((sum, m) => sum + safeNumber(m.amount), 0);
    
    return (<Card><h4 className="font-bold text-lg text-brand-indigo mb-4">Payment Milestones</h4><div className="space-y-3">{localMilestones.map((m, i) => (<div key={i} className="grid grid-cols-3 gap-2 items-center text-sm"><span className="font-medium text-gray-700">{m.label}</span><Input type="number" value={m.amount} onChange={(e) => handleUpdate(i, 'amount', parseFloat(e.target.value) || 0)} className="text-right" /><Select value={m.status} onChange={(e) => handleUpdate(i, 'status', e.target.value)}><option>Pending</option><option>Received</option></Select></div>))}</div><div className="border-t mt-4 pt-3 text-sm"><div className="flex justify-between"><span>Total Amount:</span> <span className="font-semibold">{formatCurrency(totalAmount)}</span></div><div className="flex justify-between"><span>Total Received:</span> <span className="font-semibold text-green-600">{formatCurrency(totalReceived)}</span></div></div></Card>);
};

const TransactionsTab = ({ transactions, openModal, onDelete }: { transactions: Transaction[]; openModal: (type: ModalType, item?: any) => void; onDelete: (id: string) => void; }) => {
    const { categories } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ category: 'all', type: 'all' });
    const [sort, setSort] = useState('date_desc');
    const filteredAndSorted = useMemo(() => {
        return [...transactions]
            .filter(tx => (searchTerm ? tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || tx.category.toLowerCase().includes(searchTerm.toLowerCase()) : true) && (filters.category === 'all' ? true : tx.category === filters.category) && (filters.type === 'all' ? true : tx.type === filters.type))
            .sort((a, b) => {
                switch (sort) {
                    case 'amount_desc': return safeNumber(b.amount) - safeNumber(a.amount);
                    case 'amount_asc': return safeNumber(a.amount) - safeNumber(b.amount);
                    case 'date_asc': return (new Date(a.date)).getTime() - (new Date(b.date)).getTime();
                    default: return (new Date(b.date)).getTime() - (new Date(a.date)).getTime(); // date_desc
                }
            });
    }, [transactions, searchTerm, filters, sort]);
    return (<Card><div className="flex justify-between items-center mb-4 flex-wrap gap-4"><h3 className="text-xl font-bold text-brand-indigo">Transactions</h3><div className="flex gap-2"><Button onClick={() => openModal('category')} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Manage Categories</Button><Button onClick={() => openModal('transaction')} className="bg-brand-yellow text-brand-indigo hover:bg-yellow-300"><PlusIcon /> Add Transaction</Button></div></div><div className="p-4 bg-gray-50 rounded-lg mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><Input placeholder="Search description, category..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /><Select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}><option value="all">All Types</option><option>Income</option><option>Expense</option></Select><Select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}><option value="all">All Categories</option>{categories.map(c => <option key={c.id}>{c.name}</option>)}<option>Client Payment</option></Select><Select value={sort} onChange={e => setSort(e.target.value)}><option value="date_desc">Date (Newest)</option><option value="date_asc">Date (Oldest)</option><option value="amount_desc">Amount (High-Low)</option><option value="amount_asc">Amount (Low-High)</option></Select></div>{filteredAndSorted.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b bg-gray-50"><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3"></th></tr></thead><tbody>{filteredAndSorted.map(tx => (<tr key={tx.id} className="border-b hover:bg-gray-50">
        <td className="p-3">{formatDate(tx.date)}</td>
        <td className="p-3">{tx.description}</td>
        <td className="p-3">{tx.category}</td>
        <td className={`p-3 text-right font-semibold ${tx.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(tx.amount)}</td>
        <td className="p-3 text-right"><div className="flex justify-end gap-2"><button onClick={() => openModal('transaction', tx)} className="text-gray-400 hover:text-brand-indigo"><PencilIcon /></button><button onClick={() => onDelete(tx.id)} className="text-gray-400 hover:text-red-600"><TrashIcon /></button></div></td>
    </tr>))}</tbody></table></div> : <EmptyState title="No Transactions Found" message="Add an income or expense transaction to get started." />}</Card>);
};

const BreakdownsTab = ({ transactions }: { transactions: Transaction[] }) => {
    const expenseBreakdown = useMemo(() => {
        const expenses = transactions.filter(t => t.type === 'Expense');
        const totalExpenses = expenses.reduce((sum, t) => sum + safeNumber(t.amount), 0);

        const byCategory = expenses.reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + safeNumber(t.amount);
            return acc;
        }, {} as Record<string, number>);

        const byPaymentMode = expenses.reduce((acc, t) => {
            acc[t.paymentMode] = (acc[t.paymentMode] || 0) + safeNumber(t.amount);
            return acc;
        }, {} as Record<string, number>);

        const formatBreakdown = (data: Record<string, number>, total: number) => Object.entries(data)
            .map(([key, value]) => ({ key, value, percentage: total > 0 ? (value / total) * 100 : 0 }))
            .sort((a, b) => b.value - a.value);

        return {
            category: formatBreakdown(byCategory, totalExpenses),
            paymentMode: formatBreakdown(byPaymentMode, totalExpenses),
            totalExpenses
        };
    }, [transactions]);
// FIX: Extracted props to a type alias to fix TS inference issues.
type BreakdownTableProps = {
    title: string;
    data: { key: string; value: number; percentage: number }[];
};

const BreakdownTable = ({ title, data }: BreakdownTableProps) => (
    <Card><h4 className="font-bold text-lg text-brand-indigo mb-4">{title}</h4>{data.length > 0 ? <div className="space-y-2">{data.map(item => (<div key={item.key} className="flex justify-between items-center text-sm"><div className="flex items-center w-full"><span className="w-1/3 truncate">{item.key}</span><div className="w-2/3 bg-gray-200 rounded-full h-2.5"><div className="bg-brand-indigo h-2.5 rounded-full" style={{ width: `${item.percentage}%` }} /></div></div><span className="ml-4 font-semibold w-28 text-right">{formatCurrency(item.value)}</span></div>))}</div> : <p className="text-sm text-gray-500">No expense data available.</p>}</Card>
);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <BreakdownTable title="Expenses by Category" data={expenseBreakdown.category} />
            <BreakdownTable title="Expenses by Payment Mode" data={expenseBreakdown.paymentMode} />
        </div>
    );
};

const FollowUpsTab = ({ followUps, openModal, onDelete }: { followUps: FollowUp[]; openModal: (type: ModalType, item?: any) => void; onDelete: (id: string) => void; }) => {
    const sortedFollowUps = useMemo(() => {
        return [...followUps].sort((a, b) => (new Date(b.date)).getTime() - (new Date(a.date)).getTime());
    }, [followUps]);
    const overdue = sortedFollowUps.filter(f => f.status === 'Pending' && differenceInDays(new Date(), parseISO(f.date)) > 0);
    const upcoming = sortedFollowUps.filter(f => f.status === 'Pending' && differenceInDays(new Date(), parseISO(f.date)) <= 0);
    const completed = sortedFollowUps.filter(f => f.status === 'Completed');
// FIX: Extracted props to a type alias to fix TS inference issues.
type FollowUpListProps = {
    title: string;
    items: FollowUp[];
    color: string;
};

const FollowUpList = ({ title, items, color }: FollowUpListProps) => (
    <div><h4 className={`font-bold text-lg mb-4 text-${color}-600`}>{title} ({items.length})</h4>{items.length > 0 ? <div className="space-y-3">{items.map(f => (<div key={f.id} className="p-4 rounded-lg bg-white shadow-sm border-l-4" style={{borderColor: color}}><div className="flex justify-between items-start"><div><p className="font-semibold">{f.title}</p><p className="text-sm text-gray-600">{f.details}</p><p className="text-xs text-gray-400 mt-2">Logged on {formatDate(f.date)} by {f.owner}</p>{f.nextFollowUpDate && <p className="text-xs text-gray-500 font-medium">Next follow-up: {formatDate(f.nextFollowUpDate)}</p>}</div><div className="flex gap-2"><button onClick={() => openModal('followup', f)} className="text-gray-400 hover:text-brand-indigo"><PencilIcon/></button><button onClick={() => onDelete(f.id)} className="text-gray-400 hover:text-red-600"><TrashIcon/></button></div></div></div>))}</div> : <p className="text-sm text-gray-500">None.</p>}</div>
);

    return <Card><div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-brand-indigo">Client Follow-Ups</h3><Button onClick={() => openModal('followup')} className="bg-brand-yellow text-brand-indigo hover:bg-yellow-300"><PlusIcon /> Add Follow-Up</Button></div><div className="space-y-8"><FollowUpList title="Overdue" items={overdue} color="red" /><FollowUpList title="Upcoming" items={upcoming} color="blue" /><FollowUpList title="Completed" items={completed} color="gray" /></div></Card>;
};

const TodosTab = ({ todos, openModal, onToggle, onDelete }: { todos: Todo[], openModal: (type: ModalType, item?: any) => void; onToggle: (todo: Todo) => void; onDelete: (id: string) => void; }) => {
    const openTodos = useMemo(() => todos.filter(t => t.status === 'Open').sort((a,b) => TODO_PRIORITIES.indexOf(b.priority) - TODO_PRIORITIES.indexOf(a.priority)), [todos]);
    const doneTodos = useMemo(() => todos.filter(t => t.status === 'Done'), [todos]);
    
    const priorityColor = (priority: 'Low' | 'Medium' | 'High') => ({ Low: 'bg-green-100 text-green-800', Medium: 'bg-yellow-100 text-yellow-800', High: 'bg-red-100 text-red-800' }[priority]);
// FIX: Extracted props to a type alias to fix TS inference issues.
type TodoListProps = {
    title: string;
    items: Todo[];
};

const TodoList = ({ title, items }: TodoListProps) => (
    <div><h4 className="font-bold text-lg mb-4">{title} ({items.length})</h4>{items.length > 0 ? <div className="space-y-2">{items.map(t => (<div key={t.id} className={`flex items-center p-3 rounded-lg ${t.status === 'Done' ? 'bg-gray-100' : 'bg-white shadow-sm'}`}><input type="checkbox" checked={t.status === 'Done'} onChange={() => onToggle(t)} className="h-5 w-5 rounded border-gray-300 text-brand-indigo focus:ring-brand-yellow" /><div className="ml-4 flex-1"><p className={`${t.status === 'Done' ? 'line-through text-gray-500' : ''}`}>{t.task}</p><div className="text-xs text-gray-500 flex items-center gap-4 mt-1"><span>Due: {formatDate(t.dueDate)}</span>{t.assignee && <span>To: {t.assignee}</span>}<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor(t.priority)}`}>{t.priority}</span></div></div><div className="flex gap-2"><button onClick={() => openModal('todo', t)} className="text-gray-400 hover:text-brand-indigo"><PencilIcon/></button><button onClick={() => onDelete(t.id)} className="text-gray-400 hover:text-red-600"><TrashIcon/></button></div></div>))}</div> : <p className="text-sm text-gray-500">All caught up!</p>}</div>
);
    
    return <Card><div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-brand-indigo">To-Do List</h3><Button onClick={() => openModal('todo')} className="bg-brand-yellow text-brand-indigo hover:bg-yellow-300"><PlusIcon /> Add To-Do</Button></div><div className="space-y-8"><TodoList title="Open" items={openTodos} /><TodoList title="Done" items={doneTodos} /></div></Card>;
};

const ReportsTab = ({ project, transactions, followUps, todos, handlePrint }: { project: Project; transactions: Transaction[]; followUps: FollowUp[]; todos: Todo[]; handlePrint: () => void }) => {
    const handleExport = (type: 'transactions' | 'followups' | 'todos') => {
        const timestamp = new Date().toISOString().slice(0, 10);
        if (type === 'transactions') {
            const data = transactions.map(t => [t.id, t.date, t.type, t.description, t.category, t.amount, t.paymentMode, t.vendor, t.invoiceNo]);
            exportToCsv(`${project.name}_transactions_${timestamp}`, [['ID', 'Date', 'Type', 'Description', 'Category', 'Amount', 'Payment Mode', 'Vendor', 'Invoice No.'], ...data]);
        } else if (type === 'followups') {
            const data = followUps.map(f => [f.id, f.date, f.title, f.details, f.owner, f.status, f.nextFollowUpDate]);
            exportToCsv(`${project.name}_followups_${timestamp}`, [['ID', 'Date', 'Title', 'Details', 'Owner', 'Status', 'Next Follow-up'], ...data]);
        } else if (type === 'todos') {
            const data = todos.map(t => [t.id, t.task, t.assignee, t.priority, t.dueDate, t.status]);
            exportToCsv(`${project.name}_todos_${timestamp}`, [['ID', 'Task', 'Assignee', 'Priority', 'Due Date', 'Status'], ...data]);
        }
    };
    return (<Card><h3 className="text-xl font-bold text-brand-indigo mb-6">Reporting & Exports</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><Button onClick={() => handleExport('transactions')} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800">Export Transactions CSV</Button><Button onClick={() => handleExport('followups')} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800">Export Follow-Ups CSV</Button><Button onClick={() => handleExport('todos')} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800">Export To-Dos CSV</Button><Button onClick={handlePrint} className="w-full bg-brand-indigo hover:bg-indigo-700 text-white">Print Project Summary</Button></div></Card>);
};

const PrintableView = ({ project, transactions, calcs }: { project: Project; transactions: Transaction[]; calcs: any }) => (
    <div className="p-8 font-sans text-gray-800">
        <header className="flex justify-between items-center border-b-2 border-brand-indigo pb-4 mb-8">
            <div><h1 className="text-4xl font-bold text-brand-indigo">{project.name}</h1><p className="text-gray-600">{project.siteAddress}</p></div>
            <div className="text-right"><div className="font-bold text-lg">Solar Oasis</div><p className="text-sm">Project Summary</p></div>
        </header>
        <section className="mb-8"><h2 className="text-2xl font-semibold border-b pb-2 mb-4 text-brand-indigo">Client Details</h2><div className="grid grid-cols-2 gap-4"><p><strong>Client:</strong> {project.clientName}</p><p><strong>Company:</strong> {project.clientCompany || 'N/A'}</p><p><strong>Phone:</strong> {project.clientPhone}</p><p><strong>Email:</strong> {project.clientEmail}</p></div></section>
        <section className="mb-8"><h2 className="text-2xl font-semibold border-b pb-2 mb-4 text-brand-indigo">Financial Summary</h2><div className="grid grid-cols-2 gap-x-8 gap-y-4"><div><h3 className="font-bold text-lg">Estimation</h3><table className="w-full text-sm mt-2"><tbody><tr><td className="py-1">Contract Value:</td><td className="text-right font-medium">{formatCurrency(calcs.estimatedRevenue)}</td></tr><tr><td className="py-1">Est. CAPEX:</td><td className="text-right font-medium">{formatCurrency(calcs.estimatedCapEx)}</td></tr><tr className="border-t"><td className="py-1 font-semibold">Est. Gross Profit:</td><td className="text-right font-bold">{formatCurrency(calcs.estimatedGrossProfit)}</td></tr><tr><td className="py-1 font-semibold">Est. Margin:</td><td className="text-right font-bold">{calcs.estimatedMargin.toFixed(2)}%</td></tr></tbody></table></div><div><h3 className="font-bold text-lg">Actuals</h3><table className="w-full text-sm mt-2"><tbody><tr><td className="py-1">Total Revenue:</td><td className="text-right font-medium">{formatCurrency(calcs.totalRevenue)}</td></tr><tr><td className="py-1">Total Expenses:</td><td className="text-right font-medium">{formatCurrency(calcs.totalExpenses)}</td></tr><tr className="border-t"><td className="py-1 font-semibold">Net Profit:</td><td className="text-right font-bold">{formatCurrency(calcs.netProfit)}</td></tr><tr><td className="py-1 font-semibold">Profit Margin:</td><td className="text-right font-bold">{calcs.profitMargin.toFixed(2)}%</td></tr></tbody></table></div></div></section>
        <section><h2 className="text-2xl font-semibold border-b pb-2 mb-4 text-brand-indigo">Transactions</h2>{transactions.length > 0 ? <table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Date</th><th className="text-left p-2">Description</th><th className="text-left p-2">Category</th><th className="text-right p-2">Amount</th></tr></thead><tbody>{transactions.map(t => <tr key={t.id} className="border-b"><td className="p-2">{formatDate(t.date)}</td><td className="p-2">{t.description}</td><td className="p-2">{t.category}</td><td className={`p-2 text-right font-medium ${t.type === 'Income' ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(t.amount)}</td></tr>)}</tbody></table> : <p>No transactions recorded.</p>}</section>
    </div>
);

// ===================================================================================
// MODAL FORM IMPLEMENTATIONS
// ===================================================================================

const ProjectFormModal = ({ isOpen, onClose, project, onSave, onSuccess }: { isOpen: boolean; onClose: () => void; project: Project | null; onSave: (data: Partial<Project>, existing: Project | null) => void; onSuccess: (msg: string) => void; }) => {
    const [formData, setFormData] = useState<Partial<Project>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            setFormData(project ? { ...project } : {
                ...DEFAULT_PROJECT
            });
            setErrors({});
        }
    }, [isOpen, project]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        if (name.startsWith('estimation.')) {
            const field = name.split('.')[1];
            setFormData(prev => ({ ...prev, estimation: { ...prev.estimation, [field]: type === 'checkbox' ? checked : value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.name) newErrors.name = "Project name is required.";
        if (!formData.clientName) newErrors.clientName = "Client name is required.";
        if (formData.clientEmail && !isEmailValid(formData.clientEmail)) newErrors.clientEmail = "Please enter a valid email address.";
        if (!formData.clientPhone || !isPhoneValid(formData.clientPhone)) newErrors.clientPhone = "A valid client phone is required.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        onSave(formData, project);
        onSuccess(`Project ${project ? 'updated' : 'created'} successfully!`);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={project ? 'Edit Project' : 'Create New Project'}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="border-b pb-4">
                    <h4 className="font-semibold text-lg text-gray-800 mb-4">Project & Client Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Project Name" name="name" value={formData.name || ''} onChange={handleChange} error={errors.name} required />
                        <Select label="Status" name="status" value={formData.status || 'Draft'} onChange={handleChange}>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</Select>
                        <Input label="Client Name" name="clientName" value={formData.clientName || ''} onChange={handleChange} error={errors.clientName} required />
                        <Input label="Client Company (Optional)" name="clientCompany" value={formData.clientCompany || ''} onChange={handleChange} />
                        <Input label="Client Phone" name="clientPhone" type="tel" value={formData.clientPhone || ''} onChange={handleChange} error={errors.clientPhone} required />
                        <Input label="Client Email (Optional)" name="clientEmail" type="email" value={formData.clientEmail || ''} onChange={handleChange} error={errors.clientEmail} />
                        <div className="md:col-span-2"><Input label="Site Address" name="siteAddress" value={formData.siteAddress || ''} onChange={handleChange} required /></div>
                        <Input label="Google Maps Link (Optional)" name="googleMapsLink" value={formData.googleMapsLink || ''} onChange={handleChange} />
                        <Select label="Authority" name="authority" value={formData.authority || ''} onChange={handleChange}>{UAE_AUTHORITIES.map(a => <option key={a} value={a}>{a}</option>)}</Select>
                    </div>
                </div>
                <div className="border-b pb-4">
                    <h4 className="font-semibold text-lg text-gray-800 mb-4">Contract & Dates</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label="Contract Value (AED)" name="contractValue" type="number" step="0.01" value={formData.contractValue ?? ''} onChange={handleChange} />
                        <Input label="Expected Start Date" name="expectedStartDate" type="date" value={toInputDate(formData.expectedStartDate)} onChange={handleChange} />
                        <Input label="Expected End Date" name="expectedEndDate" type="date" value={toInputDate(formData.expectedEndDate)} onChange={handleChange} />
                    </div>
                </div>
                 <div className="border-b pb-4">
                    <h4 className="font-semibold text-lg text-gray-800 mb-4">Estimation</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="System Size (kWp)" name="estimation.systemSizeKwp" type="number" step="0.1" value={formData.estimation?.systemSizeKwp ?? ''} onChange={handleChange} />
                        <Input label="Total CAPEX Budget (AED)" name="estimation.totalCapexBudget" type="number" step="0.01" value={formData.estimation?.totalCapexBudget ?? ''} onChange={handleChange} />
                        <Input label="Contingency (%)" name="estimation.contingencyPercent" type="number" step="1" value={formData.estimation?.contingencyPercent ?? ''} onChange={handleChange} />
                        <Input label="VAT (%)" name="estimation.vatPercent" type="number" step="0.1" value={formData.estimation?.vatPercent ?? ''} onChange={handleChange} />
                        <div className="flex items-center gap-2 pt-6"><input type="checkbox" name="estimation.capexIncludesVat" id="capexIncludesVat" checked={formData.estimation?.capexIncludesVat || false} onChange={handleChange} className="h-4 w-4 rounded" /><label htmlFor="capexIncludesVat">CAPEX includes VAT</label></div>
                    </div>
                </div>
                <div className="md:col-span-2"><Textarea label="Notes (Optional)" name="notes" value={formData.notes || ''} onChange={handleChange} rows={3} /></div>
                <div className="flex justify-end gap-4"><Button onClick={onClose} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button><Button type="submit" className="bg-brand-indigo text-white hover:bg-indigo-700">Save Project</Button></div>
            </form>
        </Modal>
    );
};

const TransactionFormModal = ({ isOpen, onClose, transaction, projectId, onSave, onSuccess }: { isOpen: boolean; onClose: () => void; transaction: Transaction | null; projectId: string; onSave: (data: Partial<Transaction>, existing: Transaction | null) => void; onSuccess: (msg: string) => void; }) => {
    const { categories } = useAppContext();
    const [formData, setFormData] = useState<Partial<Transaction>>({});

    useEffect(() => {
        if (isOpen) {
            setFormData(transaction ? { ...transaction } : { type: 'Expense', date: new Date().toISOString().slice(0, 10), project_id: projectId });
        }
    }, [isOpen, transaction, projectId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.description || formData.amount === null || formData.amount === undefined) return;
        onSave({ ...formData, project_id: projectId }, transaction);
        onSuccess(`Transaction ${transaction ? 'updated' : 'added'}!`);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={transaction ? 'Edit Transaction' : 'Add Transaction'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select label="Type" name="type" value={formData.type} onChange={handleChange}><option>Expense</option><option>Income</option></Select>
                    <Input label="Date" name="date" type="date" value={toInputDate(formData.date)} onChange={handleChange} required />
                </div>
                <Input label="Description" name="description" value={formData.description || ''} onChange={handleChange} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Input label="Amount (AED)" name="amount" type="number" step="0.01" value={formData.amount ?? ''} onChange={handleChange} required />
                     {formData.type === 'Expense' ? (
                        <Select label="Category" name="category" value={formData.category} onChange={handleChange} required>
                            <option value="">Select Category</option>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </Select>
                     ) : (
                         <Input label="Category" name="category" value={formData.category || 'Client Payment'} onChange={handleChange} readOnly />
                     )}
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select label="Payment Mode" name="paymentMode" value={formData.paymentMode} onChange={handleChange}>{DEFAULT_PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}</Select>
                    <Input label="Vendor (Optional)" name="vendor" value={formData.vendor || ''} onChange={handleChange} />
                </div>
                <Input label="Invoice No. (Optional)" name="invoiceNo" value={formData.invoiceNo || ''} onChange={handleChange} />
                <div className="flex justify-end gap-4 pt-4"><Button onClick={onClose} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button><Button type="submit" className="bg-brand-indigo text-white hover:bg-indigo-700">Save Transaction</Button></div>
            </form>
        </Modal>
    );
};

const CategoryManagerModal = ({ isOpen, onClose, categories, onSuccess, onSave, onDelete }: { isOpen: boolean; onClose: () => void; categories: Category[]; onSuccess: (msg: string) => void; onSave: (data: Partial<Category>, existing: Category | null) => void; onDelete: (id: string) => void; }) => {
    const [newCategoryName, setNewCategoryName] = useState('');
    const handleAddCategory = () => {
        if (newCategoryName.trim() && !categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
            onSave({ name: newCategoryName.trim() }, null);
            onSuccess('Category added!');
            setNewCategoryName('');
        }
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Manage Expense Categories">
            <div className="space-y-4">
                <div><h4 className="font-semibold mb-2">Add New Category</h4><div className="flex gap-2"><Input placeholder="E.g., Marketing" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} /><Button onClick={handleAddCategory} className="bg-brand-yellow text-brand-indigo hover:bg-yellow-300">Add</Button></div></div>
                <div><h4 className="font-semibold mb-2">Existing Categories</h4><ul className="space-y-2 max-h-60 overflow-y-auto pr-2">{categories.map(cat => <li key={cat.id} className="flex justify-between items-center bg-gray-100 p-2 rounded-md"><span>{cat.name}</span><button onClick={() => onDelete(cat.id)} className="text-gray-400 hover:text-red-600"><TrashIcon /></button></li>)}</ul></div>
            </div>
        </Modal>
    );
};

const FollowUpFormModal = ({ isOpen, onClose, followUp, projectId, onSuccess, onSave }: { isOpen: boolean; onClose: () => void; followUp: FollowUp | null; projectId: string; onSuccess: (msg: string) => void; onSave: (data: Partial<FollowUp>, existing: FollowUp | null) => void; }) => {
    const [formData, setFormData] = useState<Partial<FollowUp>>({});
    useEffect(() => {
        if (isOpen) setFormData(followUp ? { ...followUp } : { project_id: projectId, status: 'Pending', date: new Date().toISOString().slice(0, 10) });
    }, [isOpen, followUp, projectId]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title || !formData.details) return;
        onSave({ ...formData, project_id: projectId }, followUp);
        onSuccess('Follow-up saved!');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={followUp ? 'Edit Follow-up' : 'Add Follow-up'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Title" name="title" value={formData.title || ''} onChange={handleChange} required />
                <Textarea label="Details" name="details" value={formData.details || ''} onChange={handleChange} rows={4} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Log Date" name="date" type="date" value={toInputDate(formData.date)} onChange={handleChange} required />
                    <Input label="Owner" name="owner" value={formData.owner || ''} onChange={handleChange} required />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select label="Status" name="status" value={formData.status} onChange={handleChange}><option>Pending</option><option>Completed</option></Select>
                    <Input label="Next Follow-up Date (Optional)" name="nextFollowUpDate" type="date" value={toInputDate(formData.nextFollowUpDate)} onChange={handleChange} />
                </div>
                <div className="flex justify-end gap-4 pt-4"><Button onClick={onClose} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button><Button type="submit" className="bg-brand-indigo text-white hover:bg-indigo-700">Save</Button></div>
            </form>
        </Modal>
    );
};

const TodoFormModal = ({ isOpen, onClose, todo, projectId, onSuccess, onSave }: { isOpen: boolean; onClose: () => void; todo: Todo | null; projectId: string; onSuccess: (msg: string) => void; onSave: (data: Partial<Todo>, existing: Todo | null) => void; }) => {
    const [formData, setFormData] = useState<Partial<Todo>>({});
    useEffect(() => {
        if (isOpen) setFormData(todo ? { ...todo } : { project_id: projectId, status: 'Open', priority: 'Medium' });
    }, [isOpen, todo, projectId]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.task) return;
        onSave({ ...formData, project_id: projectId }, todo);
        onSuccess('To-do saved!');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={todo ? 'Edit To-do' : 'Add To-do'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Task" name="task" value={formData.task || ''} onChange={handleChange} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Assignee (Optional)" name="assignee" value={formData.assignee || ''} onChange={handleChange} />
                    <Select label="Priority" name="priority" value={formData.priority} onChange={handleChange}>{TODO_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Input label="Due Date (Optional)" name="dueDate" type="date" value={toInputDate(formData.dueDate)} onChange={handleChange} />
                     <Select label="Status" name="status" value={formData.status} onChange={handleChange}><option>Open</option><option>Done</option></Select>
                </div>
                <div className="flex justify-end gap-4 pt-4"><Button onClick={onClose} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancel</Button><Button type="submit" className="bg-brand-indigo text-white hover:bg-indigo-700">Save</Button></div>
            </form>
        </Modal>
    );
};

export default App;