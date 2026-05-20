const ButtonComponent = ({ onClick, text, id, classNameProps, disabled }: { onClick: () => void, text: string, id?: string, classNameProps?: string, disabled?: boolean }) => {
  return (
    <button
      id={id}
      className={`bg-[#277fbc] text-white p-2 rounded-md ${classNameProps}`}
      onClick={onClick}
      disabled={disabled}
    >
      {text}
    </button>
  );
}

export default ButtonComponent