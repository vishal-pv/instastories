from server import create_app

app = create_app()

if __name__ == "__main__":
    print("\n============================================================")
    print(">> INSTAGRAM CAROUSEL CLONING ENGINE WEB SERVER")
    print(">> Architecture: Modular Blueprints & Services")
    print(">> Running on: http://localhost:5000")
    print("============================================================\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
