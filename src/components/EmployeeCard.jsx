// src/components/EmployeeCard.jsx

export default function EmployeeCard({ person, employment, isSelected, onClick }) {
    const isFired = !employment || employment.is_active === false || !!employment.end_date;
    const batch = employment?.broiler_batches;

    return (
        <div
            onClick={onClick}
            className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-sm hover:shadow-md ${
                isSelected
                    ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                    : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
        >
            <p className="font-bold text-gray-800 truncate">{person.full_name}</p>
            {employment?.position && <p className="text-xs text-gray-500 mt-0.5 truncate">{employment.position}</p>}

            <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isFired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
                <span>{isFired ? '🔴 Уволен' : '🟢 Работает'}</span>
                {isFired
                    ? employment?.end_date && (
                        <span className="opacity-75">{new Date(employment.end_date).toLocaleDateString()}</span>
                    )
                    : employment?.start_date && (
                        <span className="opacity-75">c {new Date(employment.start_date).toLocaleDateString()}</span>
                    )}
            </div>

            {batch && (
                <p className={`mt-2 text-xs px-2 py-0.5 rounded-full inline-block ${
                    batch.is_active ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-500'
                }`}>
                    {batch.batch_name} {!batch.is_active && '(архив)'}
                </p>
            )}
        </div>
    );
}
