export default function EstadoBar({ icon: Icon, label, right, iconBg = '#2C2C2A' }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4">
      <div className="bg-[#F5EFE3] rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: iconBg }}
          >
            <Icon className="text-white" />
          </div>
          <span className="text-[15px] font-semibold text-[#2C2C2A]">{label}</span>
        </div>
        {right}
      </div>
    </div>
  );
}
