import { InputHTMLAttributes } from "react";

function InputComponent({ className, label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex gap-2 items-center">
      {label && <label htmlFor={props.id}>{label}</label>}
      <input className={`border border-gray-300 rounded-md p-2 ${className}`} {...props} />
    </div>
  )
}

export default InputComponent