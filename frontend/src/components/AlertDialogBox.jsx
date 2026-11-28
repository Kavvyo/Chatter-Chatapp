import { Loader2 } from "lucide-react";
import { useState } from "react";

function AlertDialogBox({ setAlertOpen, mainfunc, btnTxt, title, description }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleMainFunc = async () => {
    setIsLoading(true);
    try {
      await mainfunc?.();
    } finally {
      setIsLoading(false);
    }
    setAlertOpen(false);
  };

  return (
    <div className="bg-base-100 rounded-3xl w-full max-w-md p-6 border border-base-300 shadow-2xl flex flex-col gap-5">
      <div className="space-y-1.5">
        <h2 className="font-bold text-lg tracking-tight text-base-content">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-base-content/70 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2.5">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => setAlertOpen(false)}
          className="btn btn-sm sm:btn-md btn-ghost rounded-xl"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={handleMainFunc}
          className="btn btn-sm sm:btn-md btn-error text-white rounded-xl"
        >
          {isLoading && <Loader2 className="size-4 animate-spin" />}
          {btnTxt}
        </button>
      </div>
    </div>
  );
}

export default AlertDialogBox;
