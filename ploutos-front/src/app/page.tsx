import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-blue-600">
          Welcome to Ploutos
        </h1>
        <p className="text-xl text-gray-600">
          Hello World! Your financial journey starts here.
        </p>
      </div>
    </main>
  );
}
