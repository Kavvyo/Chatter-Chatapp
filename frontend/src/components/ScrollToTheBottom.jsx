import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

function ScrollToTheBottom() {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const container = document.querySelector(".chat-scroll-container");
    if (!container) return;

    const handleScroll = () => {
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowButton(!atBottom);
    };

    container.addEventListener("scroll", handleScroll);
    handleScroll(); // trigger once in case already scrolled

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToBottom = () => {
    const container = document.querySelector(".chat-scroll-container");
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  return (
    showButton && (
      <button
        className="fixed bottom-[7rem] right-[4.5rem] max-sm:right-[1.5rem] z-50
                  size-8 rounded-full bg-neutral border border-gray-600 shadow-lg flex items-center 
                  justify-center "
        onClick={scrollToBottom}
      >
        <ChevronDown className="text-white"/>
      </button>
    )
  );
}

export default ScrollToTheBottom;
