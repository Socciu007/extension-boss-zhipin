import React from 'react'
import ButtonComponent from './ButtonComponent'

interface Props {
  columns: {
    key: string;
    title: string;
    render?: (row: any) => React.ReactNode;
  }[];
  data: any[];
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
}

const TableComponent: React.FC<Props> = ({ columns, data, page, pageSize, total, onPageChange }) => {
  const totalPages = Math.ceil(total / (pageSize || 10))
  return (
    <div className="w-full">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.title}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2">
        <ButtonComponent classNameProps='bg-gray-300 px-2 py-1' onClick={() => onPageChange(page - 1)} text={ "<<" } disabled={page === 1} />
        <span>Page {page} of {totalPages}</span>
        <ButtonComponent classNameProps='bg-gray-300 px-2 py-1' onClick={() => onPageChange(page + 1)} text={ ">>" } disabled={page === totalPages} />
      </div>
    </div>
  )
}

export default TableComponent