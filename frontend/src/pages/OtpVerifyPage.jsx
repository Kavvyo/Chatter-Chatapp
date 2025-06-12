import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Loader2, SquareAsterisk } from "lucide-react";

function OtpVerify() {
  const {OtpVerify, authUser, isVerifing, resendOtp} = useAuthStore();

  const [formData, setFormData] = useState({
        email: authUser.email,
        otp: "",
      });

  const [counter, setCounter] = useState(0);

  const handleSubmit = (e) => {
      e.preventDefault();
      OtpVerify(formData);
    };

  const handleResendCode = async () => {
    await resendOtp(authUser.email);
    setCounter(60);
  };

  useEffect(() => {
    if (authUser?.otpExpires) {
      const expiry = new Date(authUser.otpExpires).getTime();
      const now = Date.now();
      const secondsLeft = Math.floor((expiry - now) / 1000);
      if (secondsLeft > 0) setCounter(secondsLeft);
    }
  }, [authUser?.otpExpires]);
  
  useEffect(() => {
    if (counter === 0) return;
    const interval = setInterval(() => {
      setCounter((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [counter]);

  return ( 
    <div className="h-screen grid">
        <div className="flex flex-col justify-center items-center p-6 sm:p-12">

                <div className="text-center mb-2">
                  <h1 className="text-2xl font-bold mt-2">Verify your account</h1>
                  <p className="text-base-content/60 mb-5">We've sent one time password to your email</p>
                </div>
              <div className="w-16 h-16 mb-8 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20
                transition-colors ">
                <SquareAsterisk className="w-12 h-12 text-primary animated tada" />
              </div>
              
         <form onSubmit={handleSubmit} className="">
            <div className="form-control">
                <div className="relative">
                  
                  <input
                    type="number"
                    className={`input input-bordered w-full pl-5 text-center text-2xl tracking-[1rem]`}
                    placeholder="******"
                    maxLength={6}
                    value={formData.otp}
                    onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full my-5" disabled={isVerifing}>
                {isVerifing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Verifing
                  </>
                ) : (
                  "Verify"
                )}
              </button>

              </div>
          </form>
              <div className="text-center">
                <p className="text-base-content/60">
                  Didn't receive code? {" "}
                  <button 
                    onClick={handleResendCode} 
                    disabled={counter > 0}
                    className="link link-primary no-underline"
                  >
                    {counter > 0 ? `Wait ${counter}s` : "Get new code"}
                  </button>
                </p>
            </div>
        </div>
  
    </div>
  )
}

export default OtpVerify