export default function WhatsAppFloatingButton() {
  return (
    <a
      href="https://wa.me/918709393673"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-[80] grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-green-900/20 transition hover:scale-105 hover:bg-[#20bd5a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor">
        <path d="M16.02 2.67A13.25 13.25 0 0 0 4.66 22.75L2.8 29.33l6.74-1.77a13.3 13.3 0 0 0 6.47 1.66h.01a13.27 13.27 0 0 0 0-26.55Zm0 24.22a11 11 0 0 1-5.62-1.54l-.4-.24-4 .05 1.07-3.88-.26-.42a10.94 10.94 0 1 1 9.21 6.03Zm6-8.2c-.33-.17-1.95-.96-2.25-1.07-.3-.11-.52-.17-.74.17-.22.33-.85 1.07-1.04 1.29-.19.22-.39.25-.72.08-.33-.17-1.39-.51-2.64-1.63-.98-.87-1.64-1.95-1.83-2.28-.19-.33-.02-.51.14-.68.15-.15.33-.39.5-.58.17-.19.22-.33.33-.55.11-.22.06-.41-.03-.58-.08-.17-.74-1.79-1.01-2.45-.27-.64-.54-.55-.74-.56h-.63c-.22 0-.58.08-.88.41-.3.33-1.16 1.13-1.16 2.75 0 1.62 1.19 3.18 1.35 3.4.17.22 2.34 3.57 5.67 5.01.79.34 1.41.55 1.89.7.79.25 1.5.21 2.06.13.63-.09 1.95-.8 2.23-1.57.28-.77.28-1.43.19-1.57-.08-.14-.3-.22-.63-.39Z" />
      </svg>
    </a>
  );
}
