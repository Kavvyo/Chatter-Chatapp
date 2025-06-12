import { Loader2 } from "lucide-react";
import { useState } from "react";

function AlertDialogBox({setAlertOpen, mainfunc, btnTxt, title, description}) {

  const [isLoading, setIsLoading] = useState(false);


  const handleMainFunc = async () => {
    setIsLoading(true)
    try{
      await mainfunc();
    }
    finally{
    setIsLoading(false)
    }
    
    setAlertOpen(false);
  }


  return (
    <div className="bg-base-200 rounded-xl h-[14rem] w-[30rem] max-sm:h-[15rem] max-sm:w-[20rem] flex flex-col justify-center border border-gray-700 ">
   
        <div className="m-5">
            <h1 className="font-bold text-xl mb-2 ">{title}</h1>
            <p className="opacity-80">{description}</p>
        </div>

       <div className="flex justify-end gap-3 mr-5 mb-5">
        <button type="button" className="btn border border-gray-800 hover:bg-gray-700 hover:bg-opacity-70"
                onClick={() => setAlertOpen(false)}>
          Cancel
        </button>

         <button type="button" className="btn bg-red-500 text-primary-content border-0 hover:text-red-500"
                    onClick={handleMainFunc}>
            {isLoading && <Loader2 className="size-5 animate-spin" />}
            {btnTxt}
        </button>

       </div>
    </div>
  )
}

export default AlertDialogBox