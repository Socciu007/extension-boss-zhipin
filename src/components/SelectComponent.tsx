const SelectComponent = ({
  options,
  id,
  onChange,
  label,
}: {
  options: string[];
  id: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  label: string;
}) => {
  return (
    <div className="flex gap-2 items-center">
      <label htmlFor={id}>{label}</label>
      <select className="border-1 border-gray-300 rounded-md p-2" id={id} onChange={onChange}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SelectComponent;
