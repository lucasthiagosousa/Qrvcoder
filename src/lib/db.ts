import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { GeneratedCode } from '../types';
import { handleFirestoreError, OperationType } from './firestoreUtils';

export async function getCodes(userId: string): Promise<GeneratedCode[]> {
  try {
    const q = query(collection(db, 'codes'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as GeneratedCode);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'codes');
    return [];
  }
}

export async function saveCode(code: GeneratedCode): Promise<void> {
  try {
    const dataToSave = { ...code };
    Object.keys(dataToSave).forEach(key => {
      // @ts-ignore
      if (dataToSave[key] === undefined) {
        // @ts-ignore
        delete dataToSave[key];
      }
    });
    
    // Firestore rules don't accept null or empty string if it's not defined properly
    // but the rule says: !('barcode_content' in data) || data.barcode_content is string.
    // If it's empty we should ensure it's removed if the rule wants it, but size <= 200 
    // wait, our rule says: `data.barcode_content.size() <= 200`. Wait, what if size is 0? 
    // Is size() >= 0 allowed by size() <= 200? Yes, but just to be safe:
    if (!dataToSave.barcode_content) {
      delete dataToSave.barcode_content;
    }
    
    await setDoc(doc(db, 'codes', code.id), dataToSave);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `codes/${code.id}`);
  }
}

export async function updateCode(code: GeneratedCode): Promise<void> {
  try {
    const dataToUpdate: any = {
      title: code.title,
      qr_content: code.qr_content,
      updatedAt: code.updatedAt
    };
    if (code.barcode_content) dataToUpdate.barcode_content = code.barcode_content;
    if (code.barcode_type) dataToUpdate.barcode_type = code.barcode_type;
    if (code.qr_size) dataToUpdate.qr_size = code.qr_size;

    await updateDoc(doc(db, 'codes', code.id), dataToUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `codes/${code.id}`);
  }
}

export async function deleteCode(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'codes', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `codes/${id}`);
  }
}
