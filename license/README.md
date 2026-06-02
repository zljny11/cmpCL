# Model License Workflow

1. Before deployment, prepare a user-bound license config file:

```json
{
  "users": {
    "18": "BASE64_ENCODED_32_BYTE_AES_KEY"
  }
}
```

Save it as `license/user-licenses.json`.

2. Upload a `.pth` delivery in the admin page. The server will look up the requirement creator's `userId`, read that user's configured license key, and encrypt the model into a `.model` file.

3. If you need to export the deployed `license.txt` for that user from the current model, you can use:

```sh
python3 scripts/generate_model_license.py \
  --model-file campcloud-server/storage/deliveries/<requirementId>/<encrypted-file>.model \
  --output license/customer-a.txt
```

This helper only copies the already configured user license key after verifying it matches the encrypted model.

4. Send the generated or pre-configured `license.txt` file to the customer. This file is just a `base64`-encoded 32-byte AES key.

5. The web app download step checks:

- the current logged-in user id matches the delivery's `authorizedUserId`
- the uploaded `license.txt` decodes to a valid 32-byte key
- the decoded key matches the encrypted model's stored `modelKey`
- the requirement id and delivery id in the sidecar metadata still match the current record

6. Use [model_loader.py](/Users/zljny/Desktop/radyn-workspace/license/model_loader.py) to load the encrypted checkpoint:

```python
from license.model_loader import load_encrypted_checkpoint

checkpoint = load_encrypted_checkpoint(
    model_path="model_final_checkpoint.model",
    license_path="customer-a.txt",
    map_location="cpu",
)

state_dict = checkpoint["state_dict"]
```

Notes:

- The encrypted `.model` file is not a valid PyTorch checkpoint and cannot be loaded directly with `torch.load`.
- The same model always exports the same `license.txt`.
- The source of truth is the deployment config `license/user-licenses.json`, not the delivery system itself.
- The current design binds the license to a platform `userId`, not to a machine.
- The customer runtime needs `openssl` in the Docker image because AES decryption is delegated to `openssl`.
