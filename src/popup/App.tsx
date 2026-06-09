import "./App.css"
import ButtonComponent from "@/components/ButtonComponent"

export default function App() {
  return (
    <div className="mb-2">
      <div
        id="notification"
        className="absolute top-[1rem] right-[2rem] p-1 rounded-md shadow-lg"
      ></div>
      <div className="text-center text-2xl font-bold mb-2 text-[#99BBE8]">
        BOSS ZHIPIN
      </div>
      <div className="flex gap-2 justify-center">
        <ButtonComponent onClick={() => {}} text="Auto Chat" />
      </div>
    </div>
  );
}